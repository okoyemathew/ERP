import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashRegisterStatus,
  CashTransactionType,
  CreditSaleStatus,
  CustomerStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AuthorizationService } from '../auth/services/authorization.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CollectCreditPaymentDto } from './dto/collect-credit-payment.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async create(
    businessId: string,
    dto: CreateCustomerDto,
    user?: AuthenticatedUser,
  ) {
    const phone = dto.phone.trim();
    const email = dto.email?.trim().toLowerCase();
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName?.trim();
    const companyName = dto.companyName?.trim();

    const duplicateChecks: Prisma.CustomerWhereInput[] = [
      { phone },
      ...(email ? [{ email }] : []),
      ...(companyName
        ? [
            {
              companyName: {
                equals: companyName,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ]
        : []),
    ];

    const duplicate = await this.prisma.customer.findFirst({
      where: {
        businessId,
        deletedAt: null,
        OR: duplicateChecks,
      },
    });

    if (duplicate) {
      throw new BadRequestException(
        'Customer with the same phone, email, or company name already exists',
      );
    }

    const customer = await this.prisma.customer.create({
      data: {
        businessId,
        customerCode: dto.customerCode?.trim() || null,
        firstName,
        lastName: lastName || null,
        companyName: companyName || null,
        email: email || null,
        phone,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        country: dto.country?.trim() || null,
        creditLimit: dto.creditLimit ?? 0,
        outstandingBalance: dto.outstandingBalance ?? 0,
        notes: dto.notes?.trim() || null,
        status: dto.status ?? CustomerStatus.ACTIVE,
        isSynced: true,
        syncVersion: 1,
        deviceId: dto.deviceId ?? null,
      },
    });

    await this.createAuditLog(
      businessId,
      user?.id,
      'CREATE',
      'Customer',
      customer.id,
      `Created customer ${this.displayName(customer)}`,
      dto.deviceId,
    );

    return customer;
  }

  async findAll(businessId: string, query: CustomerQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildWhere(businessId, query);

    const [total, items] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: {
              sales: true,
              payments: true,
              creditSales: true,
              creditPayments: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async search(businessId: string, term: string, query: CustomerQueryDto = {}) {
    return this.findAll(businessId, { ...query, search: term || query.search });
  }

  async findOne(businessId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        sales: { orderBy: { saleDate: 'desc' }, take: 10 },
        payments: { orderBy: { paymentDate: 'desc' }, take: 10 },
        creditSales: { orderBy: { createdAt: 'desc' }, take: 10 },
        creditPayments: { orderBy: { paymentDate: 'desc' }, take: 10 },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateCustomerDto,
    user?: AuthenticatedUser,
  ) {
    const customer = await this.findOne(businessId, id);

    await this.validateUniqueFields(businessId, id, dto, customer);

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        customerCode:
          dto.customerCode !== undefined
            ? dto.customerCode.trim() || null
            : undefined,
        firstName: dto.firstName?.trim(),
        lastName:
          dto.lastName !== undefined ? dto.lastName.trim() || null : undefined,
        companyName:
          dto.companyName !== undefined
            ? dto.companyName.trim() || null
            : undefined,
        email:
          dto.email !== undefined
            ? dto.email.trim().toLowerCase() || null
            : undefined,
        phone: dto.phone?.trim(),
        address:
          dto.address !== undefined ? dto.address.trim() || null : undefined,
        city: dto.city !== undefined ? dto.city.trim() || null : undefined,
        state: dto.state !== undefined ? dto.state.trim() || null : undefined,
        country:
          dto.country !== undefined ? dto.country.trim() || null : undefined,
        creditLimit: dto.creditLimit,
        outstandingBalance: dto.outstandingBalance,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        status: dto.status,
        isSynced: true,
        syncVersion: { increment: 1 },
        deviceId: dto.deviceId ?? undefined,
      },
    });

    await this.createAuditLog(
      businessId,
      user?.id,
      'UPDATE',
      'Customer',
      id,
      `Updated customer ${this.displayName(updated)}`,
      dto.deviceId,
    );

    return updated;
  }

  async activate(businessId: string, id: string, user?: AuthenticatedUser) {
    return this.setStatus(businessId, id, CustomerStatus.ACTIVE, user);
  }

  async deactivate(businessId: string, id: string, user?: AuthenticatedUser) {
    return this.setStatus(businessId, id, CustomerStatus.INACTIVE, user);
  }

  async getOutstandingBalance(businessId: string, id: string) {
    const customer = await this.findOne(businessId, id);
    const balance = await this.calculateCustomerBalance(businessId, id);

    return {
      customerId: customer.id,
      name: this.displayName(customer),
      creditLimit: customer.creditLimit,
      outstandingBalance: balance.totalOutstanding,
      saleBalanceDue: balance.saleBalanceDue,
      outstandingCreditBalance: balance.outstandingCreditBalance,
      storedOutstandingBalance: customer.outstandingBalance,
      availableCredit: customer.creditLimit.sub(
        balance.outstandingCreditBalance,
      ),
      status: customer.status,
    };
  }

  async getOutstandingCreditBalance(businessId: string, id: string) {
    const customer = await this.findOne(businessId, id);
    const balance = await this.calculateCustomerBalance(businessId, id);

    return {
      customerId: customer.id,
      name: this.displayName(customer),
      creditLimit: customer.creditLimit,
      outstandingCreditBalance: balance.outstandingCreditBalance,
      availableCredit: customer.creditLimit.sub(
        balance.outstandingCreditBalance,
      ),
      status: customer.status,
    };
  }

  async getProfile(businessId: string, id: string) {
    const customer = await this.findOne(businessId, id);
    const balance = await this.calculateCustomerBalance(businessId, id);

    const [
      salesTotal,
      paymentsTotal,
      creditTotal,
      creditPaid,
      saleCount,
      paymentCount,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { businessId, customerId: id, deletedAt: null },
        _sum: { totalAmount: true, balanceDue: true },
      }),
      this.prisma.payment.aggregate({
        where: { businessId, customerId: id },
        _sum: { amount: true },
      }),
      this.prisma.creditSale.aggregate({
        where: { customerId: id, sale: { businessId } },
        _sum: { totalCredit: true, balance: true },
      }),
      this.prisma.creditPayment.aggregate({
        where: { customerId: id, creditSale: { sale: { businessId } } },
        _sum: { amount: true },
      }),
      this.prisma.sale.count({
        where: { businessId, customerId: id, deletedAt: null },
      }),
      this.prisma.payment.count({ where: { businessId, customerId: id } }),
    ]);

    return {
      customer,
      summary: {
        customerType: customer.companyName ? 'COMPANY' : 'INDIVIDUAL',
        totalSales: salesTotal._sum.totalAmount ?? 0,
        saleBalanceDue: salesTotal._sum.balanceDue ?? 0,
        totalPayments: paymentsTotal._sum.amount ?? 0,
        totalCreditIssued: creditTotal._sum.totalCredit ?? 0,
        totalCreditPaid: creditPaid._sum.amount ?? 0,
        activeCreditBalance: balance.outstandingCreditBalance,
        outstandingBalance: balance.totalOutstanding,
        storedOutstandingBalance: customer.outstandingBalance,
        creditLimit: customer.creditLimit,
        availableCredit: customer.creditLimit.sub(
          balance.outstandingCreditBalance,
        ),
        saleCount,
        paymentCount,
      },
    };
  }

  async getPurchaseHistory(
    businessId: string,
    id: string,
    query: CustomerQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    await this.ensureCustomerExists(businessId, id);

    const where: Prisma.SaleWhereInput = {
      businessId,
      customerId: id,
      deletedAt: null,
    };
    const [total, items] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: {
          items: { include: { product: true } },
          payments: true,
          creditSale: true,
        },
        orderBy: { saleDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSalesHistory(
    businessId: string,
    id: string,
    query: CustomerQueryDto = {},
  ) {
    return this.getPurchaseHistory(businessId, id, query);
  }

  async getPaymentHistory(
    businessId: string,
    id: string,
    query: CustomerQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    await this.ensureCustomerExists(businessId, id);

    const [paymentTotal, creditPaymentTotal, payments, creditPayments] =
      await Promise.all([
        this.prisma.payment.count({ where: { businessId, customerId: id } }),
        this.prisma.creditPayment.count({
          where: { customerId: id, creditSale: { sale: { businessId } } },
        }),
        this.prisma.payment.findMany({
          where: { businessId, customerId: id },
          include: { sale: true },
          orderBy: { paymentDate: 'desc' },
        }),
        this.prisma.creditPayment.findMany({
          where: { customerId: id, creditSale: { sale: { businessId } } },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
            creditSale: { include: { sale: true } },
          },
          orderBy: { paymentDate: 'desc' },
        }),
      ]);

    const data = [
      ...payments.map((payment) => ({
        type: 'SALE_PAYMENT' as const,
        date: payment.paymentDate,
        payment,
      })),
      ...creditPayments.map((payment) => ({
        type: 'CREDIT_PAYMENT' as const,
        date: payment.paymentDate,
        payment,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice((page - 1) * limit, page * limit);

    const total = paymentTotal + creditPaymentTotal;
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCreditHistory(
    businessId: string,
    id: string,
    query: CustomerQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    await this.ensureCustomerExists(businessId, id);

    const where: Prisma.CreditSaleWhereInput = {
      customerId: id,
      sale: { businessId },
    };
    const [total, items] = await Promise.all([
      this.prisma.creditSale.count({ where }),
      this.prisma.creditSale.findMany({
        where,
        include: { sale: true, payments: { orderBy: { paymentDate: 'desc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStatement(
    businessId: string,
    id: string,
    query: CustomerQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const customer = await this.findOne(businessId, id);
    const [sales, payments, creditPayments, balance] = await Promise.all([
      this.prisma.sale.findMany({
        where: { businessId, customerId: id, deletedAt: null },
        orderBy: { saleDate: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: { businessId, customerId: id },
        orderBy: { paymentDate: 'asc' },
      }),
      this.prisma.creditPayment.findMany({
        where: { customerId: id, creditSale: { sale: { businessId } } },
        include: { creditSale: true },
        orderBy: { paymentDate: 'asc' },
      }),
      this.calculateCustomerBalance(businessId, id),
    ]);

    let runningBalance = new Decimal(0);
    const entries = [
      ...sales.map((sale) => ({
        type: 'SALE' as const,
        date: sale.saleDate,
        debit: sale.totalAmount,
        credit: new Decimal(0),
        reference: sale.saleNumber,
        record: sale,
      })),
      ...payments.map((payment) => ({
        type: 'PAYMENT' as const,
        date: payment.paymentDate,
        debit: new Decimal(0),
        credit: payment.amount,
        reference: payment.referenceNumber,
        record: payment,
      })),
      ...creditPayments.map((payment) => ({
        type: 'CREDIT_PAYMENT' as const,
        date: payment.paymentDate,
        debit: new Decimal(0),
        credit: payment.amount,
        reference: payment.referenceNumber,
        record: payment,
      })),
    ]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((entry) => {
        runningBalance = runningBalance.add(entry.debit).sub(entry.credit);
        return { ...entry, runningBalance };
      });

    const total = entries.length;
    return {
      customer: {
        id: customer.id,
        name: this.displayName(customer),
        phone: customer.phone,
        email: customer.email,
      },
      summary: balance,
      data: entries.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async validateCreditLimit(
    businessId: string,
    customerId: string,
    creditAmount: number | Prisma.Decimal,
    user?: AuthenticatedUser,
  ) {
    const customer = await this.findOne(businessId, customerId);
    const amount = new Decimal(creditAmount);
    const balance = await this.calculateCustomerBalance(businessId, customerId);
    const projectedCreditBalance = balance.outstandingCreditBalance.add(amount);

    if (projectedCreditBalance.lte(customer.creditLimit)) {
      return {
        allowed: true,
        requiresOverride: false,
        creditLimit: customer.creditLimit,
        outstandingCreditBalance: balance.outstandingCreditBalance,
        projectedCreditBalance,
      };
    }

    const canOverride = user
      ? await this.authorizationService.userHasPermissions(
          user.roleId,
          businessId,
          ['credit-sales.manage'],
        )
      : false;

    if (!canOverride) {
      throw new BadRequestException(
        'Credit sale exceeds customer credit limit',
      );
    }

    return {
      allowed: true,
      requiresOverride: true,
      creditLimit: customer.creditLimit,
      outstandingCreditBalance: balance.outstandingCreditBalance,
      projectedCreditBalance,
    };
  }

  async collectCreditPayment(
    businessId: string,
    id: string,
    dto: CollectCreditPaymentDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureCustomerExists(businessId, id);
    const paymentAmount = new Decimal(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      const openCredits = await tx.creditSale.findMany({
        where: {
          customerId: id,
          ...(dto.creditSaleId ? { id: dto.creditSaleId } : {}),
          sale: { businessId },
          balance: { gt: 0 },
          status: { not: CreditSaleStatus.PAID },
        },
        orderBy: { createdAt: 'asc' },
      });

      const openBalance = openCredits.reduce(
        (sum, credit) => sum.add(credit.balance),
        new Decimal(0),
      );
      if (openCredits.length === 0 || openBalance.lt(paymentAmount)) {
        throw new BadRequestException(
          'Payment amount exceeds outstanding credit balance',
        );
      }

      let remaining = paymentAmount;
      const payments: unknown[] = [];

      for (const credit of openCredits) {
        if (remaining.lte(0)) {
          break;
        }

        const amountForCredit = Decimal.min(remaining, credit.balance);
        const newPaid = credit.amountPaid.add(amountForCredit);
        const newBalance = credit.balance.sub(amountForCredit);
        const status = newBalance.eq(0)
          ? CreditSaleStatus.PAID
          : CreditSaleStatus.PARTIALLY_PAID;

        const payment = await tx.creditPayment.create({
          data: {
            creditSaleId: credit.id,
            customerId: id,
            userId: user.id,
            paymentMethod: dto.paymentMethod,
            amount: amountForCredit,
            referenceNumber: dto.referenceNumber?.trim() || null,
            paymentDate: dto.paymentDate ?? new Date(),
            notes: dto.notes?.trim() || null,
          },
        });

        if (dto.paymentMethod === PaymentMethod.CASH) {
          await this.recordCashRegisterTransaction(tx, {
            businessId,
            userId: user.id,
            transactionType: CashTransactionType.CREDIT_PAYMENT,
            amount: amountForCredit,
            reference: credit.id,
            description: 'Cash customer credit payment',
            transactionDate: dto.paymentDate ?? new Date(),
          });
        }

        await tx.creditSale.update({
          where: { id: credit.id },
          data: { amountPaid: newPaid, balance: newBalance, status },
        });

        payments.push(payment);
        remaining = remaining.sub(amountForCredit);
      }

      const [saleBalance, creditBalance] = await Promise.all([
        tx.sale.aggregate({
          where: {
            businessId,
            customerId: id,
            deletedAt: null,
            balanceDue: { gt: 0 },
          },
          _sum: { balanceDue: true },
        }),
        tx.creditSale.aggregate({
          where: {
            customerId: id,
            sale: { businessId },
            balance: { gt: 0 },
            status: { not: CreditSaleStatus.PAID },
          },
          _sum: { balance: true },
        }),
      ]);
      const recalculatedOutstanding = (
        saleBalance._sum.balanceDue ?? new Decimal(0)
      ).add(creditBalance._sum.balance ?? new Decimal(0));

      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: {
          outstandingBalance: recalculatedOutstanding,
          isSynced: true,
          syncVersion: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          businessId,
          userId: user.id,
          action: 'UPDATE',
          entity: 'CreditPayment',
          entityId: id,
          description: `Collected credit payment of ${paymentAmount.toFixed(2)} from customer ${this.displayName(updatedCustomer)}`,
          deviceId: dto.deviceId ?? null,
        },
      });

      return {
        customerId: id,
        amountCollected: paymentAmount,
        payments,
        outstandingCreditBalance: creditBalance._sum.balance ?? new Decimal(0),
        customerOutstandingBalance: updatedCustomer.outstandingBalance,
      };
    });
  }

  private async recordCashRegisterTransaction(
    tx: Tx,
    data: {
      businessId: string;
      userId: string;
      transactionType: CashTransactionType;
      amount: Decimal;
      reference: string;
      description: string;
      transactionDate: Date;
    },
  ) {
    const register = await tx.cashRegister.findFirst({
      where: {
        businessId: data.businessId,
        userId: data.userId,
        status: CashRegisterStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
      select: { id: true, openingBalance: true, expectedBalance: true },
    });

    if (!register) {
      throw new BadRequestException(
        'Open cash register is required for cash credit payments',
      );
    }

    const currentBalance =
      register.expectedBalance ??
      (await this.calculateRegisterCashBalance(tx, register.id));
    const nextBalance = currentBalance.add(data.amount);

    await tx.cashRegisterTransaction.create({
      data: {
        cashRegisterId: register.id,
        transactionType: data.transactionType,
        amount: data.amount,
        reference: data.reference,
        description: data.description,
        transactionDate: data.transactionDate,
      },
    });

    await tx.cashRegister.update({
      where: { id: register.id },
      data: { expectedBalance: nextBalance },
    });
  }

  private async calculateRegisterCashBalance(tx: Tx, cashRegisterId: string) {
    const register = await tx.cashRegister.findUnique({
      where: { id: cashRegisterId },
      select: { openingBalance: true },
    });

    if (!register) {
      throw new NotFoundException('Cash register not found');
    }

    const transactions = await tx.cashRegisterTransaction.findMany({
      where: { cashRegisterId },
      select: { transactionType: true, amount: true },
    });
    const inflowTypes: CashTransactionType[] = [
      CashTransactionType.SALE,
      CashTransactionType.CREDIT_PAYMENT,
      CashTransactionType.CASH_IN,
    ];
    const outflowTypes: CashTransactionType[] = [
      CashTransactionType.EXPENSE,
      CashTransactionType.CASH_OUT,
    ];

    return transactions.reduce((balance, transaction) => {
      if (inflowTypes.includes(transaction.transactionType)) {
        return balance.add(transaction.amount);
      }

      if (outflowTypes.includes(transaction.transactionType)) {
        return balance.sub(transaction.amount);
      }

      return balance;
    }, new Decimal(register.openingBalance));
  }

  private async setStatus(
    businessId: string,
    id: string,
    status: CustomerStatus,
    user?: AuthenticatedUser,
  ) {
    const customer = await this.findOne(businessId, id);
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { status, isSynced: true, syncVersion: { increment: 1 } },
    });

    await this.createAuditLog(
      businessId,
      user?.id,
      'UPDATE',
      'CustomerStatus',
      id,
      `Changed customer ${this.displayName(customer)} status to ${status}`,
    );

    return updated;
  }

  private async ensureCustomerExists(businessId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId, deletedAt: null },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }

  private async calculateCustomerBalance(
    businessId: string,
    customerId: string,
  ) {
    const [saleBalance, creditBalance] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          businessId,
          customerId,
          deletedAt: null,
          balanceDue: { gt: 0 },
        },
        _sum: { balanceDue: true },
      }),
      this.prisma.creditSale.aggregate({
        where: {
          customerId,
          sale: { businessId },
          balance: { gt: 0 },
          status: { not: CreditSaleStatus.PAID },
        },
        _sum: { balance: true },
      }),
    ]);

    const saleBalanceDue = saleBalance._sum.balanceDue ?? new Decimal(0);
    const outstandingCreditBalance =
      creditBalance._sum.balance ?? new Decimal(0);

    return {
      saleBalanceDue,
      outstandingCreditBalance,
      totalOutstanding: saleBalanceDue.add(outstandingCreditBalance),
    };
  }

  private buildWhere(
    businessId: string,
    query: CustomerQueryDto,
  ): Prisma.CustomerWhereInput {
    const search = query.search?.trim();

    return {
      businessId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.isActive !== undefined
        ? {
            status: query.isActive
              ? CustomerStatus.ACTIVE
              : { not: CustomerStatus.ACTIVE },
          }
        : {}),
      ...(query.isCompany !== undefined
        ? { companyName: query.isCompany ? { not: null } : null }
        : {}),
      ...(query.hasOutstandingBalance ? { outstandingBalance: { gt: 0 } } : {}),
      ...(search
        ? {
            OR: [
              { customerCode: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async validateUniqueFields(
    businessId: string,
    id: string,
    dto: UpdateCustomerDto,
    current: Awaited<ReturnType<CustomerService['findOne']>>,
  ) {
    const checks: Prisma.CustomerWhereInput[] = [];
    const phone = dto.phone?.trim();
    const email = dto.email?.trim().toLowerCase();
    const companyName = dto.companyName?.trim();

    if (phone && phone !== current.phone) {
      checks.push({ phone });
    }

    if (email && email !== current.email) {
      checks.push({ email });
    }

    if (companyName && companyName !== current.companyName) {
      checks.push({
        companyName: {
          equals: companyName,
          mode: Prisma.QueryMode.insensitive,
        },
      });
    }

    if (checks.length === 0) {
      return;
    }

    const duplicate = await this.prisma.customer.findFirst({
      where: { businessId, deletedAt: null, id: { not: id }, OR: checks },
    });

    if (duplicate) {
      throw new BadRequestException(
        'Customer with the same phone, email, or company name already exists',
      );
    }
  }

  private async createAuditLog(
    businessId: string,
    userId: string | undefined,
    action: 'CREATE' | 'UPDATE',
    entity: string,
    entityId: string,
    description: string,
    deviceId?: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: userId ?? null,
        action,
        entity,
        entityId,
        description,
        deviceId: deviceId ?? null,
      },
    });
  }

  private displayName(customer: {
    firstName: string;
    lastName?: string | null;
    companyName?: string | null;
  }) {
    return (
      customer.companyName ||
      [customer.firstName, customer.lastName].filter(Boolean).join(' ')
    );
  }
}
