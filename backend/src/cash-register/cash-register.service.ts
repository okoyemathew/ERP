import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CashRegisterStatus,
  CashTransactionType,
  PaymentMethod,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  CashRegisterQueryDto,
  DailyBalanceQueryDto,
} from './dto/cash-register-query.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { OpenRegisterDto } from './dto/open-register.dto';
import { RegisterAdjustmentDto } from './dto/register-adjustment.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class CashRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async open(
    businessId: string,
    dto: OpenRegisterDto,
    user: AuthenticatedUser,
  ) {
    const openingBalance = new Prisma.Decimal(dto.openingBalance ?? 0);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.cashRegister.findFirst({
        where: {
          businessId,
          userId: user.id,
          status: CashRegisterStatus.OPEN,
        },
      });

      if (existing) {
        throw new BadRequestException('User already has an open cash register');
      }

      const register = await tx.cashRegister.create({
        data: {
          businessId,
          userId: user.id,
          openingBalance,
          expectedBalance: openingBalance,
          status: CashRegisterStatus.OPEN,
        },
      });

      await tx.cashRegisterTransaction.create({
        data: {
          cashRegisterId: register.id,
          transactionType: CashTransactionType.OPENING_BALANCE,
          amount: openingBalance,
          description: dto.notes?.trim() || 'Opening balance',
          transactionDate: register.openedAt,
        },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.CREATE,
        entity: 'CashRegister',
        entityId: register.id,
        description: 'Opened cash register',
      });

      return this.findOne(businessId, register.id, tx);
    });
  }

  async current(businessId: string, user: AuthenticatedUser) {
    const register = await this.prisma.cashRegister.findFirst({
      where: {
        businessId,
        userId: user.id,
        status: CashRegisterStatus.OPEN,
      },
      include: this.registerInclude(),
      orderBy: { openedAt: 'desc' },
    });

    return register ? this.formatRegister(register) : null;
  }

  async findAll(businessId: string, query: CashRegisterQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.CashRegisterWhereInput = {
      businessId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.startDate || query.endDate
        ? {
            openedAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    };

    const [total, registers] = await Promise.all([
      this.prisma.cashRegister.count({ where }),
      this.prisma.cashRegister.findMany({
        where,
        include: this.registerInclude(),
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: registers.map((register) => this.formatRegister(register)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(
    businessId: string,
    id: string,
    tx: Tx | PrismaService = this.prisma,
  ) {
    const register = await tx.cashRegister.findFirst({
      where: { id, businessId },
      include: this.registerInclude(),
    });

    if (!register) {
      throw new NotFoundException('Cash register not found');
    }

    return this.formatRegister(register);
  }

  async adjustment(
    businessId: string,
    dto: RegisterAdjustmentDto,
    user: AuthenticatedUser,
  ) {
    const amount = new Prisma.Decimal(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      const register = await this.getOpenRegisterOrThrow(
        businessId,
        user.id,
        tx,
      );
      const currentBalance =
        register.expectedBalance ??
        (await this.calculateRegisterCashBalance(tx, register.id));
      const nextBalance = currentBalance.add(
        this.cashRegisterDelta(dto.transactionType, amount),
      );

      if (nextBalance.lt(0)) {
        throw new BadRequestException(
          'Cash register balance cannot be negative',
        );
      }

      await tx.cashRegisterTransaction.create({
        data: {
          cashRegisterId: register.id,
          transactionType: dto.transactionType,
          amount,
          reference: dto.reference?.trim() || null,
          description: dto.description?.trim() || null,
        },
      });

      await tx.cashRegister.update({
        where: { id: register.id },
        data: { expectedBalance: nextBalance },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entity: 'CashRegister',
        entityId: register.id,
        description: `Recorded ${dto.transactionType} cash register adjustment`,
      });

      return this.findOne(businessId, register.id, tx);
    });
  }

  async close(
    businessId: string,
    dto: CloseRegisterDto,
    user: AuthenticatedUser,
  ) {
    const actualBalance = new Prisma.Decimal(dto.actualBalance);

    return this.prisma.$transaction(async (tx) => {
      const register = await this.getOpenRegisterOrThrow(
        businessId,
        user.id,
        tx,
      );
      const expectedBalance =
        register.expectedBalance ??
        (await this.calculateRegisterCashBalance(tx, register.id));
      const difference = actualBalance.sub(expectedBalance);

      await tx.cashRegisterTransaction.create({
        data: {
          cashRegisterId: register.id,
          transactionType: CashTransactionType.CLOSING_BALANCE,
          amount: actualBalance,
          description: dto.notes?.trim() || 'Closing balance',
        },
      });

      await tx.cashRegister.update({
        where: { id: register.id },
        data: {
          closingBalance: expectedBalance,
          expectedBalance,
          actualBalance,
          status: CashRegisterStatus.CLOSED,
          closedAt: new Date(),
        },
      });

      await this.upsertDailyBalance(businessId, new Date(), tx);

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entity: 'CashRegister',
        entityId: register.id,
        description: `Closed cash register with difference ${difference.toFixed(2)}`,
      });

      return this.findOne(businessId, register.id, tx);
    });
  }

  async dailyBalance(businessId: string, query: DailyBalanceQueryDto = {}) {
    const day = this.startOfDay(query.date ?? new Date());
    return this.calculateDailyBalance(businessId, day, this.prisma);
  }

  private async upsertDailyBalance(businessId: string, date: Date, tx: Tx) {
    const balanceDate = this.startOfDay(date);
    const balance = await this.calculateDailyBalance(
      businessId,
      balanceDate,
      tx,
    );

    await tx.dailyBalance.upsert({
      where: { businessId_balanceDate: { businessId, balanceDate } },
      create: {
        businessId,
        balanceDate,
        openingBalance: balance.openingBalance,
        totalSales: balance.sales,
        totalExpenses: balance.expenses,
        totalCreditReceived: balance.creditPayments,
        closingBalance: balance.closingBalance,
      },
      update: {
        openingBalance: balance.openingBalance,
        totalSales: balance.sales,
        totalExpenses: balance.expenses,
        totalCreditReceived: balance.creditPayments,
        closingBalance: balance.closingBalance,
      },
    });
  }

  private async calculateDailyBalance(
    businessId: string,
    day: Date,
    tx: Tx | PrismaService,
  ) {
    const start = this.startOfDay(day);
    const end = this.endOfDay(day);

    const [opening, cashSales, cashExpenses, creditPayments, cashPayments] =
      await Promise.all([
        tx.cashRegister.aggregate({
          where: { businessId, openedAt: { gte: start, lte: end } },
          _sum: { openingBalance: true },
        }),
        tx.payment.aggregate({
          where: {
            businessId,
            paymentMethod: PaymentMethod.CASH,
            paymentDate: { gte: start, lte: end },
            sale: { status: SaleStatus.COMPLETED },
          },
          _sum: { amount: true },
        }),
        tx.expense.aggregate({
          where: {
            businessId,
            deletedAt: null,
            paymentMethod: PaymentMethod.CASH,
            expenseDate: { gte: start, lte: end },
          },
          _sum: { amount: true },
        }),
        tx.creditPayment.aggregate({
          where: {
            paymentMethod: PaymentMethod.CASH,
            paymentDate: { gte: start, lte: end },
            creditSale: { sale: { businessId } },
          },
          _sum: { amount: true },
        }),
        tx.payment.aggregate({
          where: {
            businessId,
            paymentDate: { gte: start, lte: end },
            paymentMethod: {
              in: [
                PaymentMethod.CASH,
                PaymentMethod.CARD,
                PaymentMethod.BANK_TRANSFER,
                PaymentMethod.MOBILE_MONEY,
              ],
            },
            sale: { status: SaleStatus.COMPLETED },
          },
          _sum: { amount: true },
        }),
      ]);

    const openingBalance = this.decimal(opening._sum.openingBalance);
    const sales = this.decimal(cashSales._sum.amount);
    const expenses = this.decimal(cashExpenses._sum.amount);
    const creditReceived = this.decimal(creditPayments._sum.amount);
    const cashReceived = sales.add(creditReceived);
    const allSalePayments = this.decimal(cashPayments._sum.amount);
    const closingBalance = openingBalance.add(cashReceived).sub(expenses);

    return {
      balanceDate: start,
      openingBalance,
      sales,
      expenses,
      cashReceived,
      cashPayments: sales,
      creditPayments: creditReceived,
      nonCreditSalePayments: allSalePayments,
      closingBalance,
    };
  }

  private async getOpenRegisterOrThrow(
    businessId: string,
    userId: string,
    tx: Tx,
  ) {
    const register = await tx.cashRegister.findFirst({
      where: { businessId, userId, status: CashRegisterStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      select: { id: true, openingBalance: true, expectedBalance: true },
    });

    if (!register) {
      throw new BadRequestException('Open cash register is required');
    }

    return register;
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

    return transactions.reduce(
      (balance, transaction) =>
        balance.add(
          this.cashRegisterDelta(
            transaction.transactionType,
            transaction.amount,
          ),
        ),
      new Prisma.Decimal(register.openingBalance),
    );
  }

  private cashRegisterDelta(
    transactionType: CashTransactionType,
    amount: Prisma.Decimal,
  ) {
    const value = new Prisma.Decimal(amount);
    const inflowTypes: CashTransactionType[] = [
      CashTransactionType.SALE,
      CashTransactionType.CREDIT_PAYMENT,
      CashTransactionType.CASH_IN,
    ];
    const outflowTypes: CashTransactionType[] = [
      CashTransactionType.EXPENSE,
      CashTransactionType.CASH_OUT,
    ];

    if (inflowTypes.includes(transactionType)) {
      return value;
    }

    if (outflowTypes.includes(transactionType)) {
      return value.neg();
    }

    return new Prisma.Decimal(0);
  }

  private startOfDay(date: Date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private endOfDay(date: Date) {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
  }

  private decimal(value: Prisma.Decimal | number | string | null | undefined) {
    return new Prisma.Decimal(value ?? 0);
  }

  private formatRegister(
    register: Prisma.CashRegisterGetPayload<{
      include: ReturnType<CashRegisterService['registerInclude']>;
    }>,
  ) {
    const expectedBalance =
      register.expectedBalance ?? new Prisma.Decimal(register.openingBalance);
    const actualBalance = register.actualBalance;

    return {
      id: register.id,
      businessId: register.businessId,
      userId: register.userId,
      status: register.status,
      openingBalance: register.openingBalance,
      closingBalance: register.closingBalance,
      expectedBalance,
      actualBalance,
      difference: actualBalance ? actualBalance.sub(expectedBalance) : null,
      openedAt: register.openedAt,
      closedAt: register.closedAt,
      user: {
        id: register.user.id,
        name: `${register.user.firstName} ${register.user.lastName}`.trim(),
        username: register.user.username,
      },
      totals: this.transactionTotals(register.transactions),
      transactions: register.transactions.map((transaction) => ({
        id: transaction.id,
        transactionType: transaction.transactionType,
        amount: transaction.amount,
        reference: transaction.reference,
        description: transaction.description,
        transactionDate: transaction.transactionDate,
      })),
    };
  }

  private transactionTotals(
    transactions: Array<{
      transactionType: CashTransactionType;
      amount: Prisma.Decimal;
    }>,
  ) {
    const byType = new Map<CashTransactionType, Prisma.Decimal>();

    for (const transaction of transactions) {
      byType.set(
        transaction.transactionType,
        (byType.get(transaction.transactionType) ?? new Prisma.Decimal(0)).add(
          transaction.amount,
        ),
      );
    }

    return {
      cashSales: byType.get(CashTransactionType.SALE) ?? new Prisma.Decimal(0),
      cashExpenses:
        byType.get(CashTransactionType.EXPENSE) ?? new Prisma.Decimal(0),
      creditPayments:
        byType.get(CashTransactionType.CREDIT_PAYMENT) ?? new Prisma.Decimal(0),
      cashIn: byType.get(CashTransactionType.CASH_IN) ?? new Prisma.Decimal(0),
      cashOut:
        byType.get(CashTransactionType.CASH_OUT) ?? new Prisma.Decimal(0),
    };
  }

  private registerInclude() {
    return {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
      transactions: { orderBy: { transactionDate: 'desc' } },
    } satisfies Prisma.CashRegisterInclude;
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
      },
    });
  }
}
