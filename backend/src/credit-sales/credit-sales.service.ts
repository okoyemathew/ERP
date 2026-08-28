import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CashRegisterStatus,
  CashTransactionType,
  CreditSaleStatus,
  CustomerStatus,
  InventoryTransactionType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCreditPaymentDto } from './dto/create-credit-payment.dto';
import { CreateCreditSaleDto } from './dto/create-credit-sale.dto';
import { CreditPaymentQueryDto } from './dto/credit-payment-query.dto';
import { CreditSaleItemDto } from './dto/credit-sale-item.dto';
import { CreditSaleQueryDto } from './dto/credit-sale-query.dto';

type Tx = Prisma.TransactionClient;

const CREDIT_SALE_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.SALESPERSON,
] as const;

@Injectable()
export class CreditSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    dto: CreateCreditSaleDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanCreateCreditSale(user);

    return this.prisma.$transaction(async (tx) => {
      const customer = await this.getActiveCustomerOrThrow(
        businessId,
        dto.customerId,
        tx,
      );
      const items = await this.buildCreditSaleItems(businessId, dto.items, tx);
      const totals = this.sumItems(items);
      const upfrontPaid = this.sumPayments(dto.initialPayments ?? []);
      const creditAmount = totals.totalAmount.sub(upfrontPaid);

      if (upfrontPaid.gt(totals.totalAmount)) {
        throw new BadRequestException(
          'Upfront payments cannot exceed sale total',
        );
      }

      if (creditAmount.lte(0)) {
        throw new BadRequestException(
          'Credit amount must be greater than zero',
        );
      }

      await this.assertCreditLimit(businessId, customer, creditAmount, tx);

      const saleNumber = await this.nextSaleNumber(businessId, tx);
      const status = this.creditStatus(
        creditAmount,
        new Prisma.Decimal(0),
        dto.dueDate,
      );

      const sale = await tx.sale.create({
        data: {
          businessId,
          customerId: customer.id,
          userId: user.id,
          saleNumber,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          amountPaid: totals.totalAmount,
          balanceDue: 0,
          paymentStatus: PaymentStatus.PAID,
          status: SaleStatus.COMPLETED,
          remarks: dto.remarks?.trim() || null,
          saleDate: new Date(),
          isSynced: true,
          syncVersion: 1,
          deviceId: dto.deviceId ?? null,
        },
      });

      await this.createSaleItems(sale.id, items, tx);
      await this.createInitialPayments(
        businessId,
        sale.id,
        customer.id,
        user.id,
        dto.initialPayments ?? [],
        tx,
      );
      await tx.payment.create({
        data: {
          businessId,
          saleId: sale.id,
          customerId: customer.id,
          userId: user.id,
          paymentMethod: PaymentMethod.CREDIT,
          amount: creditAmount,
          notes: 'Credit sale receivable',
        },
      });

      await this.decrementInventory(
        businessId,
        saleNumber,
        items,
        dto.deviceId,
        tx,
      );

      const creditSale = await tx.creditSale.create({
        data: {
          saleId: sale.id,
          customerId: customer.id,
          totalCredit: creditAmount,
          amountPaid: 0,
          balance: creditAmount,
          dueDate: dto.dueDate ?? null,
          status,
        },
      });

      const updatedOutstanding = new Prisma.Decimal(
        customer.outstandingBalance,
      ).add(creditAmount);

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          outstandingBalance: updatedOutstanding,
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.SALE,
        entity: 'CreditSale',
        entityId: creditSale.id,
        description: `Created credit sale ${saleNumber} for ${this.customerName(customer)}`,
        deviceId: dto.deviceId,
      });

      return this.getCreditSaleOrThrow(businessId, creditSale.id, tx);
    });
  }

  async findAll(businessId: string, query: CreditSaleQueryDto = {}) {
    await this.refreshDefaultedCredits(businessId, this.prisma);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildWhere(businessId, query);

    const [summary, total, data] = await Promise.all([
      this.creditReportSummary(where),
      this.prisma.creditSale.count({ where }),
      this.prisma.creditSale.findMany({
        where,
        include: this.creditSaleInclude(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      summary,
      data: data.map((creditSale) => this.formatCreditSale(creditSale)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async search(
    businessId: string,
    term: string,
    query: CreditSaleQueryDto = {},
  ) {
    return this.findAll(businessId, { ...query, search: term || query.search });
  }

  async findOne(businessId: string, id: string) {
    await this.refreshCreditStatus(businessId, id, this.prisma);
    const creditSale = await this.getCreditSaleOrThrow(
      businessId,
      id,
      this.prisma,
    );
    return this.formatCreditSale(creditSale);
  }

  async getCustomerCredit(
    businessId: string,
    customerId: string,
    query: CreditSaleQueryDto = {},
  ) {
    await this.refreshDefaultedCredits(businessId, this.prisma);

    const customer = await this.getCustomerOrThrow(
      businessId,
      customerId,
      this.prisma,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(businessId, {
      ...query,
      customerId,
    });

    const [summary, total, creditSales] = await Promise.all([
      this.creditSummary(businessId, customerId, this.prisma),
      this.prisma.creditSale.count({ where }),
      this.prisma.creditSale.findMany({
        where,
        include: this.creditSaleInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      customer: {
        id: customer.id,
        name: this.customerName(customer),
        phone: customer.phone,
        status: customer.status,
        creditLimit: customer.creditLimit,
        storedOutstandingBalance: customer.outstandingBalance,
      },
      summary,
      data: creditSales.map((creditSale) => this.formatCreditSale(creditSale)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCustomerOutstandingBalance(businessId: string, customerId: string) {
    const customer = await this.getCustomerOrThrow(
      businessId,
      customerId,
      this.prisma,
    );
    const summary = await this.creditSummary(
      businessId,
      customerId,
      this.prisma,
    );

    return {
      customerId: customer.id,
      name: this.customerName(customer),
      creditLimit: customer.creditLimit,
      outstandingCreditBalance: summary.outstandingBalance,
      storedOutstandingBalance: customer.outstandingBalance,
      availableCredit: summary.availableCredit,
      status: customer.status,
    };
  }

  async getBusinessOutstandingBalance(businessId: string) {
    await this.refreshDefaultedCredits(businessId, this.prisma);

    const [active, partiallyPaid, defaulted] = await Promise.all([
      this.prisma.creditSale.aggregate({
        where: {
          sale: { businessId },
          status: CreditSaleStatus.ACTIVE,
          balance: { gt: 0 },
        },
        _count: true,
        _sum: { balance: true, totalCredit: true },
      }),
      this.prisma.creditSale.aggregate({
        where: {
          sale: { businessId },
          status: CreditSaleStatus.PARTIALLY_PAID,
          balance: { gt: 0 },
        },
        _count: true,
        _sum: { balance: true, totalCredit: true },
      }),
      this.prisma.creditSale.aggregate({
        where: {
          sale: { businessId },
          status: CreditSaleStatus.DEFAULTED,
          balance: { gt: 0 },
        },
        _count: true,
        _sum: { balance: true, totalCredit: true },
      }),
    ]);

    const outstandingBalance = new Prisma.Decimal(active._sum.balance ?? 0)
      .add(partiallyPaid._sum.balance ?? 0)
      .add(defaulted._sum.balance ?? 0);

    return {
      outstandingBalance,
      activeBalance: active._sum.balance ?? new Prisma.Decimal(0),
      partiallyPaidBalance: partiallyPaid._sum.balance ?? new Prisma.Decimal(0),
      defaultedBalance: defaulted._sum.balance ?? new Prisma.Decimal(0),
      activeCount: active._count,
      partiallyPaidCount: partiallyPaid._count,
      defaultedCount: defaulted._count,
    };
  }

  async getOutstandingReport(
    businessId: string,
    query: CreditSaleQueryDto = {},
  ) {
    await this.refreshDefaultedCredits(businessId, this.prisma);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where: Prisma.CreditSaleWhereInput = {
      AND: [
        this.buildWhere(businessId, query),
        { balance: { gt: 0 }, status: { not: CreditSaleStatus.PAID } },
      ],
    };

    const [summary, total, data] = await Promise.all([
      this.creditReportSummary(where),
      this.prisma.creditSale.count({ where }),
      this.prisma.creditSale.findMany({
        where,
        include: this.creditSaleInclude(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      summary,
      data: data.map((creditSale) => this.formatCreditSale(creditSale)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOverdueReport(businessId: string, query: CreditSaleQueryDto = {}) {
    await this.refreshDefaultedCredits(businessId, this.prisma);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'dueDate';
    const sortOrder = query.sortOrder ?? 'asc';
    const where: Prisma.CreditSaleWhereInput = {
      AND: [
        this.buildWhere(businessId, { ...query, overdue: undefined }),
        {
          balance: { gt: 0 },
          dueDate: { lt: new Date() },
          status: { not: CreditSaleStatus.PAID },
        },
      ],
    };

    const [summary, total, data] = await Promise.all([
      this.creditReportSummary(where),
      this.prisma.creditSale.count({ where }),
      this.prisma.creditSale.findMany({
        where,
        include: this.creditSaleInclude(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      summary,
      data: data.map((creditSale) => this.formatCreditSale(creditSale)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getDueDate(businessId: string, id: string) {
    await this.refreshCreditStatus(businessId, id, this.prisma);
    const creditSale = await this.getCreditSaleOrThrow(
      businessId,
      id,
      this.prisma,
    );

    return {
      id: creditSale.id,
      saleId: creditSale.saleId,
      saleNumber: creditSale.sale.saleNumber,
      dueDate: creditSale.dueDate,
      isOverdue: this.isOverdue(creditSale),
      status: creditSale.status,
      balance: creditSale.balance,
    };
  }

  async getStatus(businessId: string, id: string) {
    await this.refreshCreditStatus(businessId, id, this.prisma);
    const creditSale = await this.getCreditSaleOrThrow(
      businessId,
      id,
      this.prisma,
    );

    return {
      id: creditSale.id,
      saleId: creditSale.saleId,
      saleNumber: creditSale.sale.saleNumber,
      status: creditSale.status,
      isOverdue: this.isOverdue(creditSale),
      totalCredit: creditSale.totalCredit,
      amountPaid: creditSale.amountPaid,
      balance: creditSale.balance,
      dueDate: creditSale.dueDate,
    };
  }

  async getRemainingBalance(businessId: string, id: string) {
    await this.refreshCreditStatus(businessId, id, this.prisma);
    const creditSale = await this.getCreditSaleOrThrow(
      businessId,
      id,
      this.prisma,
    );

    return this.formatCreditBalance(creditSale);
  }

  async getPaymentHistory(
    businessId: string,
    id: string,
    query: CreditPaymentQueryDto = {},
  ) {
    const creditSale = await this.getCreditSaleOrThrow(
      businessId,
      id,
      this.prisma,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildPaymentWhere(businessId, query, {
      creditSaleId: id,
    });

    const [total, payments] = await Promise.all([
      this.prisma.creditPayment.count({ where }),
      this.prisma.creditPayment.findMany({
        where,
        include: this.creditPaymentInclude(),
        orderBy: { [query.sortBy ?? 'paymentDate']: query.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      creditSale: this.formatCreditBalance(creditSale),
      data: payments.map((payment) => this.formatCreditPayment(payment)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCustomerPaymentHistory(
    businessId: string,
    customerId: string,
    query: CreditPaymentQueryDto = {},
  ) {
    const customer = await this.getCustomerOrThrow(
      businessId,
      customerId,
      this.prisma,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildPaymentWhere(businessId, query, { customerId });

    const [summary, total, payments] = await Promise.all([
      this.creditSummary(businessId, customerId, this.prisma),
      this.prisma.creditPayment.count({ where }),
      this.prisma.creditPayment.findMany({
        where,
        include: this.creditPaymentInclude(),
        orderBy: { [query.sortBy ?? 'paymentDate']: query.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      customer: {
        id: customer.id,
        name: this.customerName(customer),
        phone: customer.phone,
        status: customer.status,
      },
      summary,
      data: payments.map((payment) => this.formatCreditPayment(payment)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCustomerStatement(
    businessId: string,
    customerId: string,
    query: CreditPaymentQueryDto = {},
  ) {
    const customer = await this.getCustomerOrThrow(
      businessId,
      customerId,
      this.prisma,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search?.trim();

    const [summary, creditSales, payments] = await Promise.all([
      this.creditSummary(businessId, customerId, this.prisma),
      this.prisma.creditSale.findMany({
        where: {
          customerId,
          sale: {
            businessId,
            ...(search
              ? {
                  saleNumber: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                }
              : {}),
          },
          ...(query.startDate || query.endDate
            ? {
                createdAt: {
                  ...(query.startDate ? { gte: query.startDate } : {}),
                  ...(query.endDate ? { lte: query.endDate } : {}),
                },
              }
            : {}),
        },
        include: { sale: { select: { saleNumber: true, saleDate: true } } },
      }),
      this.prisma.creditPayment.findMany({
        where: this.buildPaymentWhere(businessId, query, { customerId }),
        include: this.creditPaymentInclude(),
      }),
    ]);

    let runningBalance = new Prisma.Decimal(0);
    const entries = [
      ...creditSales.map((creditSale) => ({
        type: 'CREDIT_SALE' as const,
        date: creditSale.createdAt,
        debit: creditSale.totalCredit,
        credit: new Prisma.Decimal(0),
        reference: creditSale.sale.saleNumber,
        creditSaleId: creditSale.id,
        status: creditSale.status,
        dueDate: creditSale.dueDate,
      })),
      ...payments.map((payment) => ({
        type: 'CREDIT_PAYMENT' as const,
        date: payment.paymentDate,
        debit: new Prisma.Decimal(0),
        credit: payment.amount,
        reference:
          payment.referenceNumber ?? payment.creditSale.sale.saleNumber,
        creditSaleId: payment.creditSaleId,
        paymentMethod: payment.paymentMethod,
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
        name: this.customerName(customer),
        phone: customer.phone,
        status: customer.status,
      },
      summary,
      data: entries.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async collectPayment(
    businessId: string,
    id: string,
    dto: CreateCreditPaymentDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanManageCredit(user);
    this.assertAllowedCreditPaymentMethod(dto.paymentMethod);
    const idempotencyKey = dto.idempotencyKey?.trim();

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existingPayment = await tx.creditPayment.findUnique({
          where: { idempotencyKey },
          select: {
            id: true,
            creditSaleId: true,
            creditSale: { select: { sale: { select: { businessId: true } } } },
          },
        });

        if (existingPayment) {
          if (
            existingPayment.creditSaleId !== id ||
            existingPayment.creditSale.sale.businessId !== businessId
          ) {
            throw new BadRequestException('Idempotency key is already in use');
          }

          const updated = await this.getCreditSaleOrThrow(businessId, id, tx);
          return this.formatCreditSale(updated);
        }
      }

      await this.refreshCreditStatus(businessId, id, tx);

      const creditSale = await this.getCreditSaleOrThrow(businessId, id, tx);
      const amount = new Prisma.Decimal(dto.amount);

      if (creditSale.customer.status !== CustomerStatus.ACTIVE) {
        throw new BadRequestException('Customer must be active');
      }

      if (amount.lte(0)) {
        throw new BadRequestException(
          'Payment amount must be greater than zero',
        );
      }

      if (
        creditSale.status === CreditSaleStatus.PAID ||
        creditSale.balance.lte(0)
      ) {
        throw new BadRequestException('Credit sale is already paid');
      }

      if (amount.gt(creditSale.balance)) {
        throw new BadRequestException(
          'Payment amount exceeds outstanding credit balance',
        );
      }

      const newAmountPaid = creditSale.amountPaid.add(amount);
      const newBalance = creditSale.balance.sub(amount);
      const status = newBalance.eq(0)
        ? CreditSaleStatus.PAID
        : CreditSaleStatus.PARTIALLY_PAID;

      const payment = await tx.creditPayment.create({
        data: {
          creditSaleId: creditSale.id,
          customerId: creditSale.customerId,
          userId: user.id,
          paymentMethod: dto.paymentMethod,
          amount,
          referenceNumber: dto.referenceNumber?.trim() || null,
          paymentDate: dto.paymentDate ?? new Date(),
          notes: dto.notes?.trim() || null,
          idempotencyKey: idempotencyKey || null,
        },
      });

      if (dto.paymentMethod === PaymentMethod.CASH) {
        await this.recordCashRegisterTransaction(tx, {
          businessId,
          userId: user.id,
          transactionType: CashTransactionType.CREDIT_PAYMENT,
          amount,
          reference: creditSale.sale.saleNumber,
          description: `Cash credit payment: ${creditSale.sale.saleNumber}`,
          transactionDate: dto.paymentDate ?? new Date(),
        });
      }

      await tx.creditSale.update({
        where: { id },
        data: {
          amountPaid: newAmountPaid,
          balance: newBalance,
          status,
        },
      });

      const nextOutstanding = await this.customerOutstandingBalance(
        businessId,
        creditSale.customerId,
        tx,
      );

      await tx.customer.update({
        where: { id: creditSale.customerId },
        data: {
          outstandingBalance: nextOutstanding,
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.CREDIT_PAYMENT_CREATED,
        entity: 'CreditPayment',
        entityId: payment.id,
        description: `Collected ${amount.toFixed(2)} for credit sale ${creditSale.sale.saleNumber}`,
        deviceId: dto.deviceId,
      });

      const updated = await this.getCreditSaleOrThrow(businessId, id, tx);
      return this.formatCreditSale(updated);
    });
  }

  private async buildCreditSaleItems(
    businessId: string,
    items: CreditSaleItemDto[],
    tx: Tx,
  ) {
    if (!items.length) {
      throw new BadRequestException('Sale must contain products');
    }

    const builtItems = [];
    for (const item of items) {
      const product = await this.findSellableProduct(businessId, item, tx);
      const unitPrice = new Prisma.Decimal(
        item.unitPrice ?? product.sellingPrice,
      );
      const baseSellingPrice = new Prisma.Decimal(product.baseSellingPrice);

      if (unitPrice.lt(baseSellingPrice)) {
        throw new BadRequestException(
          'Sale price is below the allowed selling price.',
        );
      }

      const discountAmount = new Prisma.Decimal(item.discountAmount ?? 0);
      const taxAmount = new Prisma.Decimal(item.taxAmount ?? 0);
      const gross = unitPrice.mul(item.quantity);

      if (discountAmount.gt(gross)) {
        throw new BadRequestException('Discount cannot exceed item subtotal');
      }

      builtItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
        discountAmount,
        taxAmount,
        totalAmount: gross.sub(discountAmount).add(taxAmount),
        inventory: product.inventory,
      });
    }

    this.assertGroupedInventoryAvailable(businessId, builtItems);
    return builtItems;
  }

  private async findSellableProduct(
    businessId: string,
    lookup: { productId?: string; barcode?: string; sku?: string },
    tx: Tx,
  ) {
    const productId = lookup.productId?.trim();
    const barcode = lookup.barcode?.trim();
    const sku = lookup.sku?.trim();

    if (!productId && !barcode && !sku) {
      throw new BadRequestException('productId, barcode, or sku is required');
    }

    const product = await tx.product.findFirst({
      where: {
        businessId,
        isActive: true,
        OR: [
          ...(productId ? [{ id: productId }] : []),
          ...(barcode ? [{ barcode }] : []),
          ...(barcode ? [{ barcodes: { some: { barcode } } }] : []),
          ...(sku ? [{ sku }] : []),
        ],
      },
      select: {
        id: true,
        sellingPrice: true,
        baseSellingPrice: true,
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found or inactive');
    }

    if (!product.inventory || product.inventory.deletedAt) {
      throw new BadRequestException('Product inventory is not available');
    }

    if (new Prisma.Decimal(product.sellingPrice).lt(0)) {
      throw new BadRequestException('Product selling price is invalid');
    }

    return product;
  }

  private assertGroupedInventoryAvailable(
    businessId: string,
    items: Array<{
      productId: string;
      quantity: number;
      inventory: {
        businessId: string;
        quantityAvailable: number;
        quantityOnHand: number;
        deletedAt: Date | null;
      } | null;
    }>,
  ) {
    const quantityByProduct = new Map<string, number>();
    const inventoryByProduct = new Map<
      string,
      NonNullable<(typeof items)[number]['inventory']>
    >();

    for (const item of items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) ?? 0) + item.quantity,
      );

      if (item.inventory) {
        inventoryByProduct.set(item.productId, item.inventory);
      }
    }

    for (const [productId, quantity] of quantityByProduct) {
      const inventory = inventoryByProduct.get(productId);

      if (
        !inventory ||
        inventory.businessId !== businessId ||
        inventory.deletedAt
      ) {
        throw new BadRequestException(
          `Inventory not found for product ${productId}`,
        );
      }

      if (
        inventory.quantityAvailable < quantity ||
        inventory.quantityOnHand < quantity
      ) {
        throw new BadRequestException('Insufficient inventory for product');
      }
    }
  }

  private async createSaleItems(
    saleId: string,
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
    }>,
    tx: Tx,
  ) {
    for (const item of items) {
      await tx.saleItem.create({
        data: {
          saleId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          totalAmount: item.totalAmount,
        },
      });
    }
  }

  private async createInitialPayments(
    businessId: string,
    saleId: string,
    customerId: string,
    userId: string,
    payments: CreateCreditPaymentDto[],
    tx: Tx,
  ) {
    for (const payment of payments) {
      this.assertAllowedCreditPaymentMethod(payment.paymentMethod);

      await tx.payment.create({
        data: {
          businessId,
          saleId,
          customerId,
          userId,
          paymentMethod: payment.paymentMethod,
          amount: payment.amount,
          referenceNumber: payment.referenceNumber?.trim() || null,
          notes: payment.notes?.trim() || null,
        },
      });

      if (payment.paymentMethod === PaymentMethod.CASH) {
        await this.recordCashRegisterTransaction(tx, {
          businessId,
          userId,
          transactionType: CashTransactionType.SALE,
          amount: new Prisma.Decimal(payment.amount),
          reference: saleId,
          description: 'Cash upfront payment for credit sale',
          transactionDate: payment.paymentDate ?? new Date(),
        });
      }
    }
  }

  private async decrementInventory(
    businessId: string,
    saleNumber: string,
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }>,
    deviceId: string | undefined,
    tx: Tx,
  ) {
    const quantityByProduct = new Map<
      string,
      { quantity: number; unitPrice: Prisma.Decimal }
    >();

    for (const item of items) {
      const current = quantityByProduct.get(item.productId);
      quantityByProduct.set(item.productId, {
        quantity: (current?.quantity ?? 0) + item.quantity,
        unitPrice: item.unitPrice,
      });
    }

    for (const [productId, item] of quantityByProduct) {
      const inventory = await tx.inventory.findUnique({
        where: { productId },
      });

      if (!inventory || inventory.businessId !== businessId) {
        throw new BadRequestException(
          `Inventory not found for product ${productId}`,
        );
      }

      if (
        inventory.quantityAvailable < item.quantity ||
        inventory.quantityOnHand < item.quantity
      ) {
        throw new BadRequestException('Insufficient inventory for product');
      }

      const quantityBefore = inventory.quantityOnHand;
      const quantityAfter = quantityBefore - item.quantity;

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          quantityOnHand: quantityAfter,
          quantityAvailable: Math.max(
            0,
            inventory.quantityAvailable - item.quantity,
          ),
          lastStockUpdate: new Date(),
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: deviceId ?? undefined,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          inventoryId: inventory.id,
          productId,
          transactionType: InventoryTransactionType.SALE,
          quantity: item.quantity,
          quantityBefore,
          quantityAfter,
          unitCost: item.unitPrice,
          referenceNumber: saleNumber,
          remarks: `Credit sale ${saleNumber}`,
          transactionDate: new Date(),
          isSynced: true,
          syncVersion: 1,
          deviceId: deviceId ?? null,
        },
      });
    }
  }

  private sumItems(
    items: Array<{
      quantity: number;
      unitPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
    }>,
  ) {
    return items.reduce(
      (totals, item) => ({
        subtotal: totals.subtotal.add(item.unitPrice.mul(item.quantity)),
        discountAmount: totals.discountAmount.add(item.discountAmount),
        taxAmount: totals.taxAmount.add(item.taxAmount),
        totalAmount: totals.totalAmount.add(item.totalAmount),
      }),
      {
        subtotal: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
      },
    );
  }

  private sumPayments(payments: CreateCreditPaymentDto[]) {
    return payments.reduce((total, payment) => {
      this.assertAllowedCreditPaymentMethod(payment.paymentMethod);
      return total.add(payment.amount);
    }, new Prisma.Decimal(0));
  }

  private async customerOutstandingBalance(
    businessId: string,
    customerId: string,
    tx: Tx | PrismaService,
  ) {
    const [saleBalance, creditBalance] = await Promise.all([
      tx.sale.aggregate({
        where: {
          businessId,
          customerId,
          deletedAt: null,
          balanceDue: { gt: 0 },
        },
        _sum: { balanceDue: true },
      }),
      tx.creditSale.aggregate({
        where: {
          customerId,
          sale: { businessId },
          balance: { gt: 0 },
          status: { not: CreditSaleStatus.PAID },
        },
        _sum: { balance: true },
      }),
    ]);

    return new Prisma.Decimal(saleBalance._sum.balanceDue ?? 0).add(
      creditBalance._sum.balance ?? 0,
    );
  }

  private async assertCreditLimit(
    businessId: string,
    customer: {
      id: string;
      creditLimit: Prisma.Decimal;
      outstandingBalance: Prisma.Decimal;
    },
    creditAmount: Prisma.Decimal,
    tx: Tx,
  ) {
    const activeCreditBalance = await this.activeCreditBalance(
      businessId,
      customer.id,
      tx,
    );
    const existingOutstanding = new Prisma.Decimal(customer.outstandingBalance);
    const effectiveOutstanding = existingOutstanding.gt(activeCreditBalance)
      ? existingOutstanding
      : activeCreditBalance;
    const projectedOutstanding = effectiveOutstanding.add(creditAmount);

    if (projectedOutstanding.gt(customer.creditLimit)) {
      throw new BadRequestException(
        'Credit sale exceeds customer credit limit',
      );
    }
  }

  private async activeCreditBalance(
    businessId: string,
    customerId: string,
    tx: Tx | PrismaService,
  ) {
    const result = await tx.creditSale.aggregate({
      where: {
        customerId,
        sale: { businessId },
        balance: { gt: 0 },
        status: { not: CreditSaleStatus.PAID },
      },
      _sum: { balance: true },
    });

    return result._sum.balance ?? new Prisma.Decimal(0);
  }

  private async creditSummary(
    businessId: string,
    customerId: string,
    tx: Tx | PrismaService,
  ) {
    const now = new Date();
    const [customer, creditTotals, defaultedTotals, nextDue] =
      await Promise.all([
        tx.customer.findFirst({
          where: { id: customerId, businessId, deletedAt: null },
          select: { creditLimit: true },
        }),
        tx.creditSale.aggregate({
          where: {
            customerId,
            sale: { businessId },
            balance: { gt: 0 },
            status: { not: CreditSaleStatus.PAID },
          },
          _count: true,
          _sum: { balance: true, totalCredit: true, amountPaid: true },
        }),
        tx.creditSale.aggregate({
          where: {
            customerId,
            sale: { businessId },
            balance: { gt: 0 },
            OR: [
              { status: CreditSaleStatus.DEFAULTED },
              { dueDate: { lt: now } },
            ],
          },
          _sum: { balance: true },
        }),
        tx.creditSale.findFirst({
          where: {
            customerId,
            sale: { businessId },
            balance: { gt: 0 },
            status: { not: CreditSaleStatus.PAID },
            dueDate: { not: null },
          },
          orderBy: { dueDate: 'asc' },
          select: { dueDate: true },
        }),
      ]);

    const outstandingBalance =
      creditTotals._sum.balance ?? new Prisma.Decimal(0);
    const creditLimit = customer?.creditLimit ?? new Prisma.Decimal(0);

    return {
      creditLimit,
      outstandingBalance,
      availableCredit: creditLimit.sub(outstandingBalance),
      defaultedBalance: defaultedTotals._sum.balance ?? new Prisma.Decimal(0),
      totalCreditIssued: creditTotals._sum.totalCredit ?? new Prisma.Decimal(0),
      totalCreditPaid: creditTotals._sum.amountPaid ?? new Prisma.Decimal(0),
      openCreditCount: creditTotals._count,
      nextDueDate: nextDue?.dueDate ?? null,
    };
  }

  private async creditReportSummary(where: Prisma.CreditSaleWhereInput) {
    const outstandingWhere: Prisma.CreditSaleWhereInput = {
      AND: [
        where,
        { balance: { gt: 0 }, status: { not: CreditSaleStatus.PAID } },
      ],
    };
    const overdueWhere: Prisma.CreditSaleWhereInput = {
      AND: [
        where,
        {
          balance: { gt: 0 },
          dueDate: { lt: new Date() },
          status: { not: CreditSaleStatus.PAID },
        },
      ],
    };

    const [
      totals,
      outstanding,
      overdue,
      activeAccounts,
      paidAccounts,
      overdueAccounts,
    ] = await Promise.all([
      this.prisma.creditSale.aggregate({
        where,
        _count: true,
        _sum: {
          totalCredit: true,
          amountPaid: true,
          balance: true,
        },
      }),
      this.prisma.creditSale.aggregate({
        where: outstandingWhere,
        _sum: { balance: true },
      }),
      this.prisma.creditSale.aggregate({
        where: overdueWhere,
        _sum: { balance: true },
      }),
      this.countCreditAccounts({
        AND: [where, { status: CreditSaleStatus.ACTIVE }],
      }),
      this.countCreditAccounts({
        AND: [where, { status: CreditSaleStatus.PAID }],
      }),
      this.countCreditAccounts(overdueWhere),
    ]);

    return {
      totalCreditSales: totals._count,
      totalCreditIssued: totals._sum.totalCredit ?? new Prisma.Decimal(0),
      totalOutstandingCredit: outstanding._sum.balance ?? new Prisma.Decimal(0),
      totalCollected: totals._sum.amountPaid ?? new Prisma.Decimal(0),
      overdueAmount: overdue._sum.balance ?? new Prisma.Decimal(0),
      activeCreditAccounts: activeAccounts,
      paidCreditAccounts: paidAccounts,
      overdueAccounts,
    };
  }

  private async countCreditAccounts(where: Prisma.CreditSaleWhereInput) {
    const accounts = await this.prisma.creditSale.groupBy({
      by: ['customerId'],
      where,
      _count: { customerId: true },
    });

    return accounts.length;
  }

  private buildPaymentWhere(
    businessId: string,
    query: CreditPaymentQueryDto,
    scope: { creditSaleId?: string; customerId?: string },
  ): Prisma.CreditPaymentWhereInput {
    const search = query.search?.trim();

    return {
      ...(scope.creditSaleId ? { creditSaleId: scope.creditSaleId } : {}),
      ...(scope.customerId ? { customerId: scope.customerId } : {}),
      creditSale: {
        sale: { businessId },
      },
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.startDate || query.endDate
        ? {
            paymentDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                referenceNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                notes: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                creditSale: {
                  sale: {
                    saleNumber: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async getCustomerOrThrow(
    businessId: string,
    customerId: string,
    tx: Tx | PrismaService,
  ) {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private async getActiveCustomerOrThrow(
    businessId: string,
    customerId: string,
    tx: Tx,
  ) {
    const customer = await this.getCustomerOrThrow(businessId, customerId, tx);

    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new BadRequestException('Customer must be active');
    }

    return customer;
  }

  private async getCreditSaleOrThrow(
    businessId: string,
    id: string,
    tx: Tx | PrismaService,
  ) {
    const creditSale = await tx.creditSale.findFirst({
      where: { id, sale: { businessId } },
      include: this.creditSaleInclude(),
    });

    if (!creditSale) {
      throw new NotFoundException('Credit sale not found');
    }

    return creditSale;
  }

  private buildWhere(
    businessId: string,
    query: CreditSaleQueryDto,
  ): Prisma.CreditSaleWhereInput {
    const search = query.search?.trim();
    const now = new Date();

    return {
      sale: { businessId },
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdue
        ? {
            balance: { gt: 0 },
            dueDate: { lt: now },
            status: { not: CreditSaleStatus.PAID },
          }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueDate: {
              ...(query.dueFrom ? { gte: query.dueFrom } : {}),
              ...(query.dueTo ? { lte: query.dueTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                sale: {
                  saleNumber: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  customerCode: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  firstName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  lastName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  companyName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  phone: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  email: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private formatCreditSale(
    creditSale: Prisma.CreditSaleGetPayload<{
      include: ReturnType<CreditSalesService['creditSaleInclude']>;
    }>,
  ) {
    return {
      id: creditSale.id,
      saleId: creditSale.saleId,
      customerId: creditSale.customerId,
      totalCredit: creditSale.totalCredit,
      amountPaid: creditSale.amountPaid,
      balance: creditSale.balance,
      dueDate: creditSale.dueDate,
      status: creditSale.status,
      isOverdue: this.isOverdue(creditSale),
      createdAt: creditSale.createdAt,
      updatedAt: creditSale.updatedAt,
      customer: {
        id: creditSale.customer.id,
        name: this.customerName(creditSale.customer),
        phone: creditSale.customer.phone,
        status: creditSale.customer.status,
        creditLimit: creditSale.customer.creditLimit,
        outstandingBalance: creditSale.customer.outstandingBalance,
      },
      sale: {
        id: creditSale.sale.id,
        saleNumber: creditSale.sale.saleNumber,
        saleDate: creditSale.sale.saleDate,
        subtotal: creditSale.sale.subtotal,
        discountAmount: creditSale.sale.discountAmount,
        taxAmount: creditSale.sale.taxAmount,
        totalAmount: creditSale.sale.totalAmount,
        paymentStatus: creditSale.sale.paymentStatus,
        status: creditSale.sale.status,
        salesperson: {
          id: creditSale.sale.user.id,
          name: `${creditSale.sale.user.firstName} ${creditSale.sale.user.lastName}`.trim(),
          username: creditSale.sale.user.username,
        },
        items: creditSale.sale.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          sku: item.product.sku,
          barcode: item.product.barcode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          totalAmount: item.totalAmount,
        })),
        payments: creditSale.sale.payments.map((payment) => ({
          id: payment.id,
          paymentMethod: payment.paymentMethod,
          amount: payment.amount,
          referenceNumber: payment.referenceNumber,
          paymentDate: payment.paymentDate,
          notes: payment.notes,
        })),
      },
      payments: creditSale.payments.map((payment) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        referenceNumber: payment.referenceNumber,
        paymentDate: payment.paymentDate,
        notes: payment.notes,
        employee: payment.user
          ? {
              id: payment.user.id,
              name: `${payment.user.firstName} ${payment.user.lastName}`.trim(),
              username: payment.user.username,
            }
          : null,
      })),
    };
  }

  private formatCreditBalance(
    creditSale: Prisma.CreditSaleGetPayload<{
      include: ReturnType<CreditSalesService['creditSaleInclude']>;
    }>,
  ) {
    return {
      id: creditSale.id,
      saleId: creditSale.saleId,
      saleNumber: creditSale.sale.saleNumber,
      customerId: creditSale.customerId,
      customerName: this.customerName(creditSale.customer),
      totalCredit: creditSale.totalCredit,
      amountPaid: creditSale.amountPaid,
      remainingBalance: creditSale.balance,
      status: creditSale.status,
      dueDate: creditSale.dueDate,
      isOverdue: this.isOverdue(creditSale),
    };
  }

  private formatCreditPayment(
    payment: Prisma.CreditPaymentGetPayload<{
      include: ReturnType<CreditSalesService['creditPaymentInclude']>;
    }>,
  ) {
    return {
      id: payment.id,
      creditSaleId: payment.creditSaleId,
      customerId: payment.customerId,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      referenceNumber: payment.referenceNumber,
      notes: payment.notes,
      paymentDate: payment.paymentDate,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      employee: payment.user
        ? {
            id: payment.user.id,
            name: `${payment.user.firstName} ${payment.user.lastName}`.trim(),
            username: payment.user.username,
          }
        : null,
      creditSale: {
        id: payment.creditSale.id,
        saleNumber: payment.creditSale.sale.saleNumber,
        totalCredit: payment.creditSale.totalCredit,
        amountPaid: payment.creditSale.amountPaid,
        balance: payment.creditSale.balance,
        status: payment.creditSale.status,
        dueDate: payment.creditSale.dueDate,
      },
    };
  }

  private creditSaleInclude() {
    return {
      customer: true,
      payments: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
      },
      sale: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  barcode: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          payments: { orderBy: { paymentDate: 'asc' } },
        },
      },
    } satisfies Prisma.CreditSaleInclude;
  }

  private creditPaymentInclude() {
    return {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
      creditSale: {
        include: {
          sale: {
            select: {
              id: true,
              saleNumber: true,
              saleDate: true,
              totalAmount: true,
            },
          },
        },
      },
    } satisfies Prisma.CreditPaymentInclude;
  }

  private async nextSaleNumber(businessId: string, tx: Tx) {
    const date = new Date();
    const prefix = `CREDIT-${date.getUTCFullYear()}${String(
      date.getUTCMonth() + 1,
    ).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
    const count = await tx.sale.count({
      where: { businessId, saleNumber: { startsWith: prefix } },
    });

    return `${prefix}-${String(count + 1).padStart(6, '0')}`;
  }

  private creditStatus(
    totalCredit: Prisma.Decimal,
    amountPaid: Prisma.Decimal,
    dueDate?: Date | null,
  ) {
    const balance = totalCredit.sub(amountPaid);

    if (balance.lte(0)) {
      return CreditSaleStatus.PAID;
    }

    if (dueDate && dueDate.getTime() < Date.now()) {
      return CreditSaleStatus.DEFAULTED;
    }

    if (amountPaid.gt(0)) {
      return CreditSaleStatus.PARTIALLY_PAID;
    }

    return CreditSaleStatus.ACTIVE;
  }

  private isOverdue(creditSale: {
    dueDate: Date | null;
    balance: Prisma.Decimal;
  }) {
    return Boolean(
      creditSale.dueDate &&
      creditSale.dueDate.getTime() < Date.now() &&
      creditSale.balance.gt(0),
    );
  }

  private async refreshDefaultedCredits(
    businessId: string,
    tx: Tx | PrismaService,
  ) {
    await tx.creditSale.updateMany({
      where: {
        sale: { businessId },
        status: {
          in: [CreditSaleStatus.ACTIVE, CreditSaleStatus.PARTIALLY_PAID],
        },
        balance: { gt: 0 },
        dueDate: { lt: new Date() },
      },
      data: { status: CreditSaleStatus.DEFAULTED },
    });
  }

  private async refreshCreditStatus(
    businessId: string,
    id: string,
    tx: Tx | PrismaService,
  ) {
    await tx.creditSale.updateMany({
      where: {
        id,
        sale: { businessId },
        status: {
          in: [CreditSaleStatus.ACTIVE, CreditSaleStatus.PARTIALLY_PAID],
        },
        balance: { gt: 0 },
        dueDate: { lt: new Date() },
      },
      data: { status: CreditSaleStatus.DEFAULTED },
    });
  }

  private assertCanCreateCreditSale(user: AuthenticatedUser) {
    this.assertCanManageCredit(user);
  }

  private assertCanManageCredit(user: AuthenticatedUser) {
    if (!CREDIT_SALE_ROLES.includes(user.roleName as never)) {
      throw new ForbiddenException(
        'User is not allowed to manage credit sales',
      );
    }
  }

  private assertAllowedCreditPaymentMethod(paymentMethod: PaymentMethod) {
    const allowedMethods: PaymentMethod[] = [
      PaymentMethod.CASH,
      PaymentMethod.BANK_TRANSFER,
      PaymentMethod.MOBILE_MONEY,
      PaymentMethod.CARD,
    ];

    if (!allowedMethods.includes(paymentMethod)) {
      throw new BadRequestException(
        'Credit payment method must be CASH, BANK_TRANSFER, MOBILE_MONEY, or CARD',
      );
    }
  }

  private async recordCashRegisterTransaction(
    tx: Tx,
    data: {
      businessId: string;
      userId: string;
      transactionType: CashTransactionType;
      amount: Prisma.Decimal;
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
    }, new Prisma.Decimal(register.openingBalance));
  }

  private customerName(customer: {
    firstName: string;
    lastName?: string | null;
    companyName?: string | null;
  }) {
    return (
      customer.companyName ||
      [customer.firstName, customer.lastName].filter(Boolean).join(' ')
    );
  }

  private async audit(
    tx: Tx,
    data: {
      businessId: string;
      userId: string;
      action: AuditAction;
      entity: string;
      entityId: string;
      description: string;
      deviceId?: string;
    },
  ) {
    await tx.auditLog.create({
      data: {
        businessId: data.businessId,
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        description: data.description,
        deviceId: data.deviceId ?? null,
      },
    });
  }
}
