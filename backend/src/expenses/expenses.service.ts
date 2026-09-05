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
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import {
  normalizeSystemRoleName,
  SYSTEM_ROLES,
  type SystemRole,
} from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import {
  CreateExpenseDto,
  EXPENSE_PAYMENT_METHODS,
} from './dto/create-expense.dto';
import {
  ExpenseCategoryQueryDto,
  ExpenseQueryDto,
} from './dto/expense-query.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

type Tx = Prisma.TransactionClient;
type ExpensePeriod = 'day' | 'week' | 'month' | 'year';
type ExpensePeriodRow = {
  period: Date;
  expense_count: bigint | number;
  total_amount: Prisma.Decimal | number | string | null;
};

const EXPENSE_ROLES: readonly SystemRole[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.SALESPERSON,
  SYSTEM_ROLES.INVENTORY_OFFICER,
  SYSTEM_ROLES.SUPERVISOR,
];

const EXPENSE_MODIFY_ROLES: readonly SystemRole[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
];

const EXPENSE_REPORT_ROLES: readonly SystemRole[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
];

const DEFAULT_EXPENSE_CATEGORY_NAME = 'Miscellaneous';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(
    businessId: string,
    dto: CreateExpenseCategoryDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanModifyExpenses(user);
    const name = dto.name.trim();
    const description = dto.description?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      await this.assertCategoryNameAvailable(businessId, name, undefined, tx);

      const category = await tx.expenseCategory.create({
        data: { businessId, name, description, isActive: true },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.CREATE,
        entity: 'ExpenseCategory',
        entityId: category.id,
        description: `Created expense category ${category.name}`,
      });

      return this.formatCategory(category);
    });
  }

  async findCategories(
    businessId: string,
    query: ExpenseCategoryQueryDto = {},
  ) {
    const search = query.search?.trim();
    const categories = await this.prisma.expenseCategory.findMany({
      where: {
        businessId,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  description: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return categories.map((category) => this.formatCategory(category));
  }

  async updateCategory(
    businessId: string,
    id: string,
    dto: UpdateExpenseCategoryDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanModifyExpenses(user);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.getCategoryOrThrow(businessId, id, tx);
      const name = dto.name?.trim();

      if (name && name !== current.name) {
        await this.assertCategoryNameAvailable(businessId, name, id, tx);
      }

      const updated = await tx.expenseCategory.update({
        where: { id },
        data: {
          name,
          description:
            dto.description !== undefined
              ? dto.description.trim() || null
              : undefined,
        },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entity: 'ExpenseCategory',
        entityId: id,
        description: `Updated expense category ${updated.name}`,
      });

      return this.formatCategory(updated);
    });
  }

  async activateCategory(
    businessId: string,
    id: string,
    user: AuthenticatedUser,
  ) {
    return this.setCategoryStatus(businessId, id, true, user);
  }

  async deactivateCategory(
    businessId: string,
    id: string,
    user: AuthenticatedUser,
  ) {
    return this.setCategoryStatus(businessId, id, false, user);
  }

  async createExpense(
    businessId: string,
    dto: CreateExpenseDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanManageExpenses(user);
    this.assertExpensePaymentMethod(dto.paymentMethod);

    return this.prisma.$transaction(async (tx) => {
      const categoryId = await this.resolveExpenseCategoryId(
        businessId,
        dto.categoryId,
        tx,
      );
      const amount = new Prisma.Decimal(dto.amount);
      this.assertPositiveAmount(amount);
      const expense = await this.createExpenseRecord(
        businessId,
        dto,
        categoryId,
        user.id,
        amount,
        tx,
      );

      if (dto.paymentMethod === PaymentMethod.CASH) {
        await this.recordCashRegisterTransaction(tx, {
          businessId,
          userId: user.id,
          transactionType: CashTransactionType.EXPENSE,
          amount,
          reference: expense.expenseNumber,
          description: `Cash expense: ${expense.title}`,
          transactionDate: expense.expenseDate,
        });
      }

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.EXPENSE,
        entity: 'Expense',
        entityId: expense.id,
        description: `Created expense ${expense.expenseNumber}`,
        deviceId: dto.deviceId,
      });

      const created = await this.getExpenseOrThrow(businessId, expense.id, tx);
      return this.formatExpense(created);
    });
  }

  async findAll(
    businessId: string,
    query: ExpenseQueryDto = {},
    user: AuthenticatedUser,
  ) {
    this.assertCanAccessExpenses(user);
    const scopedQuery = this.scopeQueryToUser(query, user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'expenseDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildWhere(businessId, scopedQuery);

    const [summary, total, expenses] = await Promise.all([
      this.expenseReportSummary(where),
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: this.expenseInclude(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      summary,
      data: expenses.map((expense) => this.formatExpense(expense)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async search(
    businessId: string,
    term: string,
    query: ExpenseQueryDto = {},
    user: AuthenticatedUser,
  ) {
    return this.findAll(
      businessId,
      { ...query, search: term || query.search },
      user,
    );
  }

  async findOne(businessId: string, id: string, user: AuthenticatedUser) {
    this.assertCanAccessExpenses(user);
    const expense = await this.getExpenseOrThrow(businessId, id, this.prisma);
    this.assertCanViewExpense(user, expense);
    return this.formatExpense(expense);
  }

  async getSummary(
    businessId: string,
    query: ExpenseQueryDto = {},
    user: AuthenticatedUser,
  ) {
    this.assertCanAccessExpenses(user);
    const where = this.buildWhere(businessId, this.scopeQueryToUser(query, user));
    return this.expenseReportSummary(where);
  }

  async getDailyReport(
    businessId: string,
    query: ExpenseQueryDto = {},
    user: AuthenticatedUser,
  ) {
    return this.getPeriodReport(businessId, query, 'day', user);
  }

  async getWeeklyReport(
    businessId: string,
    query: ExpenseQueryDto = {},
    user: AuthenticatedUser,
  ) {
    return this.getPeriodReport(businessId, query, 'week', user);
  }

  async getMonthlyReport(
    businessId: string,
    query: ExpenseQueryDto = {},
    user: AuthenticatedUser,
  ) {
    return this.getPeriodReport(businessId, query, 'month', user);
  }

  async getYearlyReport(
    businessId: string,
    query: ExpenseQueryDto = {},
    user: AuthenticatedUser,
  ) {
    return this.getPeriodReport(businessId, query, 'year', user);
  }

  async updateExpense(
    businessId: string,
    id: string,
    dto: UpdateExpenseDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getExpenseOrThrow(businessId, id, tx);
      this.assertCanMutateExpense(user, current);
      const nextPaymentMethod = dto.paymentMethod ?? current.paymentMethod;
      const nextAmount =
        dto.amount !== undefined
          ? new Prisma.Decimal(dto.amount)
          : new Prisma.Decimal(current.amount);
      this.assertPositiveAmount(nextAmount);

      this.assertExpensePaymentMethod(nextPaymentMethod);

      if (dto.categoryId) {
        await this.getActiveCategoryOrThrow(businessId, dto.categoryId, tx);
      }

      const cashDelta = this.cashImpact(nextPaymentMethod, nextAmount).sub(
        this.cashImpact(current.paymentMethod, current.amount),
      );

      const updated = await tx.expense.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          title: dto.title?.trim(),
          description:
            dto.description !== undefined
              ? dto.description.trim() || null
              : undefined,
          amount: dto.amount !== undefined ? nextAmount : undefined,
          expenseDate: dto.expenseDate,
          receiptNumber:
            dto.receiptNumber !== undefined
              ? dto.receiptNumber.trim() || null
              : undefined,
          vendor:
            dto.vendor !== undefined ? dto.vendor.trim() || null : undefined,
          paymentMethod: dto.paymentMethod,
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
      });

      if (!cashDelta.eq(0)) {
        await this.recordCashRegisterTransaction(tx, {
          businessId,
          userId: user.id,
          transactionType: cashDelta.gt(0)
            ? CashTransactionType.CASH_OUT
            : CashTransactionType.CASH_IN,
          amount: cashDelta.abs(),
          reference: current.expenseNumber,
          description: `Expense adjustment: ${updated.title}`,
          transactionDate: new Date(),
        });
      }

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entity: 'Expense',
        entityId: id,
        description: `Updated expense ${current.expenseNumber}`,
        deviceId: dto.deviceId,
      });

      const refreshed = await this.getExpenseOrThrow(businessId, id, tx);
      return this.formatExpense(refreshed);
    });
  }

  async removeExpense(
    businessId: string,
    id: string,
    user: AuthenticatedUser,
  ) {
    this.assertCanAccessExpenses(user);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.getExpenseOrThrow(businessId, id, tx);
      this.assertCanMutateExpense(user, current);

      if (current.paymentMethod === PaymentMethod.CASH) {
        await this.recordCashRegisterTransaction(tx, {
          businessId,
          userId: user.id,
          transactionType: CashTransactionType.CASH_IN,
          amount: new Prisma.Decimal(current.amount),
          reference: current.expenseNumber,
          description: `Deleted cash expense: ${current.title}`,
          transactionDate: new Date(),
        });
      }

      const deleted = await tx.expense.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isSynced: true,
          syncVersion: { increment: 1 },
        },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.DELETE,
        entity: 'Expense',
        entityId: id,
        description: `Deleted expense ${current.expenseNumber}`,
      });

      return {
        id: deleted.id,
        deleted: true,
      };
    });
  }

  private async createExpenseRecord(
    businessId: string,
    dto: CreateExpenseDto,
    categoryId: string,
    userId: string,
    amount: Prisma.Decimal,
    tx: Tx,
  ) {
    const expenseDate = dto.expenseDate ?? new Date();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const expenseNumber = await this.nextExpenseNumber(
        businessId,
        tx,
        attempt,
      );

      try {
        return await tx.expense.create({
          data: {
            businessId,
            categoryId,
            userId,
            expenseNumber,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            amount,
            expenseDate,
            receiptNumber: dto.receiptNumber?.trim() || null,
            vendor: dto.vendor?.trim() || null,
            paymentMethod: dto.paymentMethod,
            isSynced: true,
            syncVersion: 1,
            deviceId: dto.deviceId ?? null,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException('Could not generate unique expense number');
  }

  private async setCategoryStatus(
    businessId: string,
    id: string,
    isActive: boolean,
    user: AuthenticatedUser,
  ) {
    this.assertCanModifyExpenses(user);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.getCategoryOrThrow(businessId, id, tx);
      const updated = await tx.expenseCategory.update({
        where: { id },
        data: { isActive },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entity: 'ExpenseCategory',
        entityId: id,
        description: `${isActive ? 'Activated' : 'Deactivated'} expense category ${current.name}`,
      });

      return this.formatCategory(updated);
    });
  }

  private async resolveExpenseCategoryId(
    businessId: string,
    categoryId: string | undefined,
    tx: Tx,
  ) {
    if (categoryId) {
      const category = await this.getActiveCategoryOrThrow(
        businessId,
        categoryId,
        tx,
      );
      return category.id;
    }

    const category = await tx.expenseCategory.upsert({
      where: {
        businessId_name: {
          businessId,
          name: DEFAULT_EXPENSE_CATEGORY_NAME,
        },
      },
      update: { isActive: true },
      create: {
        businessId,
        name: DEFAULT_EXPENSE_CATEGORY_NAME,
        description: 'Default category for expenses without a selected category',
        isActive: true,
      },
    });

    return category.id;
  }

  private async getCategoryOrThrow(
    businessId: string,
    id: string,
    tx: Tx | PrismaService,
  ) {
    const category = await tx.expenseCategory.findFirst({
      where: { id, businessId },
    });

    if (!category) {
      throw new NotFoundException('Expense category not found');
    }

    return category;
  }

  private async getActiveCategoryOrThrow(
    businessId: string,
    id: string,
    tx: Tx | PrismaService,
  ) {
    const category = await this.getCategoryOrThrow(businessId, id, tx);

    if (!category.isActive) {
      throw new BadRequestException('Expense category is inactive');
    }

    return category;
  }

  private async getExpenseOrThrow(
    businessId: string,
    id: string,
    tx: Tx | PrismaService,
  ) {
    const expense = await tx.expense.findFirst({
      where: { id, businessId, deletedAt: null },
      include: this.expenseInclude(),
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  private async assertCategoryNameAvailable(
    businessId: string,
    name: string,
    exceptId: string | undefined,
    tx: Tx,
  ) {
    const existing = await tx.expenseCategory.findFirst({
      where: {
        businessId,
        id: exceptId ? { not: exceptId } : undefined,
        name: { equals: name, mode: Prisma.QueryMode.insensitive },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Expense category already exists');
    }
  }

  private buildWhere(
    businessId: string,
    query: ExpenseQueryDto,
  ): Prisma.ExpenseWhereInput {
    const search = query.search?.trim();
    this.assertValidAmountRange(query);

    return {
      businessId,
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.minAmount !== undefined || query.maxAmount !== undefined
        ? {
            amount: {
              ...(query.minAmount !== undefined
                ? { gte: query.minAmount }
                : {}),
              ...(query.maxAmount !== undefined
                ? { lte: query.maxAmount }
                : {}),
            },
          }
        : {}),
      ...(query.vendor
        ? {
            vendor: {
              contains: query.vendor.trim(),
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            expenseDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                expenseNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                title: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                description: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                receiptNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                vendor: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                category: {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                user: {
                  firstName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                user: {
                  lastName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                user: {
                  username: {
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

  private async expenseReportSummary(where: Prisma.ExpenseWhereInput) {
    const [totals, categoryGroups, paymentGroups, employeeGroups] =
      await Promise.all([
      this.prisma.expense.aggregate({
        where,
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.prisma.expense.groupBy({
        by: ['paymentMethod'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.prisma.expense.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
    ]);

    const categories = categoryGroups.length
      ? await this.prisma.expenseCategory.findMany({
          where: {
            id: { in: categoryGroups.map((group) => group.categoryId) },
          },
          select: { id: true, name: true },
        })
      : [];
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const employees = employeeGroups.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: employeeGroups.map((group) => group.userId) },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            employee: {
              select: {
                id: true,
                employeeCode: true,
              },
            },
          },
        })
      : [];
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );

    return {
      totalExpenses: totals._sum.amount ?? new Prisma.Decimal(0),
      expenseCount: totals._count,
      expensesByCategory: categoryGroups.map((group) => ({
        categoryId: group.categoryId,
        categoryName: categoryById.get(group.categoryId)?.name ?? 'Unknown',
        expenseCount: group._count._all,
        totalAmount: group._sum.amount ?? new Prisma.Decimal(0),
      })),
      expensesByEmployee: employeeGroups.map((group) => {
        const employee = employeeById.get(group.userId);

        return {
          userId: group.userId,
          employeeId: employee?.employee?.id ?? null,
          employeeCode: employee?.employee?.employeeCode ?? null,
          employeeName: employee
            ? `${employee.firstName} ${employee.lastName}`.trim() ||
              employee.username
            : 'Unknown',
          username: employee?.username ?? null,
          expenseCount: group._count._all,
          totalAmount: group._sum.amount ?? new Prisma.Decimal(0),
        };
      }),
      expensesByPaymentMethod: paymentGroups.map((group) => ({
        paymentMethod: group.paymentMethod,
        expenseCount: group._count._all,
        totalAmount: group._sum.amount ?? new Prisma.Decimal(0),
      })),
    };
  }

  private async getPeriodReport(
    businessId: string,
    query: ExpenseQueryDto,
    period: ExpensePeriod,
    user: AuthenticatedUser,
  ) {
    this.assertCanAccessExpenses(user);
    const scopedQuery = this.scopeQueryToUser(query, user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;
    const rawWhere = this.buildRawExpenseWhere(businessId, scopedQuery);
    const sortDirection = Prisma.raw(
      query.sortOrder === 'asc' ? 'ASC' : 'DESC',
    );
    const where = this.buildWhere(businessId, scopedQuery);

    const [summary, totalRows, rows] = await Promise.all([
      this.expenseReportSummary(where),
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total
        FROM (
          SELECT date_trunc(${period}, e."expenseDate") AS period
          FROM "Expense" e
          INNER JOIN "ExpenseCategory" c ON c.id = e."categoryId"
          INNER JOIN "User" u ON u.id = e."userId"
          WHERE ${rawWhere}
          GROUP BY period
        ) buckets
      `,
      this.prisma.$queryRaw<ExpensePeriodRow[]>`
        SELECT
          date_trunc(${period}, e."expenseDate") AS period,
          COUNT(*) AS expense_count,
          COALESCE(SUM(e.amount), 0) AS total_amount
        FROM "Expense" e
        INNER JOIN "ExpenseCategory" c ON c.id = e."categoryId"
        INNER JOIN "User" u ON u.id = e."userId"
        WHERE ${rawWhere}
        GROUP BY period
        ORDER BY period ${sortDirection}
        LIMIT ${limit}
        OFFSET ${offset}
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);

    return {
      period,
      summary,
      data: rows.map((row) => ({
        periodStart: row.period,
        expenseCount: Number(row.expense_count),
        totalAmount: new Prisma.Decimal(row.total_amount ?? 0),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private buildRawExpenseWhere(businessId: string, query: ExpenseQueryDto) {
    const search = query.search?.trim();
    const conditions: Prisma.Sql[] = [
      Prisma.sql`e."businessId" = ${businessId}`,
      Prisma.sql`e."deletedAt" IS NULL`,
    ];

    this.assertValidAmountRange(query);

    if (query.categoryId) {
      conditions.push(Prisma.sql`e."categoryId" = ${query.categoryId}`);
    }
    if (query.userId) {
      conditions.push(Prisma.sql`e."userId" = ${query.userId}`);
    }
    if (query.paymentMethod) {
      conditions.push(
        Prisma.sql`e."paymentMethod" = ${query.paymentMethod}::"PaymentMethod"`,
      );
    }
    if (query.vendor?.trim()) {
      conditions.push(Prisma.sql`e.vendor ILIKE ${`%${query.vendor.trim()}%`}`);
    }
    if (query.minAmount !== undefined) {
      conditions.push(Prisma.sql`e.amount >= ${query.minAmount}`);
    }
    if (query.maxAmount !== undefined) {
      conditions.push(Prisma.sql`e.amount <= ${query.maxAmount}`);
    }
    if (query.startDate) {
      conditions.push(Prisma.sql`e."expenseDate" >= ${query.startDate}`);
    }
    if (query.endDate) {
      conditions.push(Prisma.sql`e."expenseDate" <= ${query.endDate}`);
    }
    if (search) {
      const like = `%${search}%`;
      conditions.push(Prisma.sql`(
        e."expenseNumber" ILIKE ${like}
        OR e.title ILIKE ${like}
        OR e.description ILIKE ${like}
        OR e."receiptNumber" ILIKE ${like}
        OR e.vendor ILIKE ${like}
        OR c.name ILIKE ${like}
        OR u."firstName" ILIKE ${like}
        OR u."lastName" ILIKE ${like}
        OR u.username ILIKE ${like}
      )`);
    }

    return Prisma.join(conditions, ' AND ');
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
      select: {
        id: true,
        openingBalance: true,
        expectedBalance: true,
      },
    });

    if (!register) {
      throw new BadRequestException(
        'Open cash register is required for cash expenses',
      );
    }

    const currentBalance =
      register.expectedBalance ??
      (await this.calculateRegisterCashBalance(tx, register.id));
    const cashDelta = this.cashRegisterDelta(data.transactionType, data.amount);
    const nextBalance = currentBalance.add(cashDelta);

    if (nextBalance.lt(0)) {
      throw new BadRequestException(
        'Insufficient cash in open register for this expense',
      );
    }

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

  private cashImpact(
    paymentMethod: PaymentMethod,
    amount: Prisma.Decimal | number | string,
  ) {
    return paymentMethod === PaymentMethod.CASH
      ? new Prisma.Decimal(amount)
      : new Prisma.Decimal(0);
  }

  private formatCategory(category: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private formatExpense(
    expense: Prisma.ExpenseGetPayload<{
      include: ReturnType<ExpensesService['expenseInclude']>;
    }>,
  ) {
    return {
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      title: expense.title,
      description: expense.description,
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      receiptNumber: expense.receiptNumber,
      vendor: expense.vendor,
      paymentMethod: expense.paymentMethod,
      category: {
        id: expense.category.id,
        name: expense.category.name,
        isActive: expense.category.isActive,
      },
      recordedBy: {
        id: expense.user.id,
        name: `${expense.user.firstName} ${expense.user.lastName}`.trim(),
        username: expense.user.username,
      },
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }

  private expenseInclude() {
    return {
      category: {
        select: { id: true, name: true, isActive: true },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
    } satisfies Prisma.ExpenseInclude;
  }

  private async nextExpenseNumber(businessId: string, tx: Tx, offset = 0) {
    const date = new Date();
    const prefix = `EXP-${date.getUTCFullYear()}${String(
      date.getUTCMonth() + 1,
    ).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
    const count = await tx.expense.count({
      where: { businessId, expenseNumber: { startsWith: prefix } },
    });

    return `${prefix}-${String(count + offset + 1).padStart(6, '0')}`;
  }

  private assertCanManageExpenses(user: AuthenticatedUser) {
    const roleName = normalizeSystemRoleName(user.roleName);
    if (!roleName || !EXPENSE_ROLES.includes(roleName)) {
      throw new ForbiddenException('User is not allowed to manage expenses');
    }
  }

  private assertCanAccessExpenses(user: AuthenticatedUser) {
    const roleName = normalizeSystemRoleName(user.roleName);
    if (!roleName || !EXPENSE_ROLES.includes(roleName)) {
      throw new ForbiddenException('User is not allowed to access expenses');
    }
  }

  private assertCanModifyExpenses(user: AuthenticatedUser) {
    const roleName = normalizeSystemRoleName(user.roleName);
    if (!roleName || !EXPENSE_MODIFY_ROLES.includes(roleName)) {
      throw new ForbiddenException(
        'User is not allowed to modify completed expenses',
      );
    }
  }

  private canViewAllExpenses(user: AuthenticatedUser) {
    const roleName = normalizeSystemRoleName(user.roleName);
    return Boolean(roleName && EXPENSE_REPORT_ROLES.includes(roleName));
  }

  private scopeQueryToUser(
    query: ExpenseQueryDto,
    user: AuthenticatedUser,
  ): ExpenseQueryDto {
    if (this.canViewAllExpenses(user)) {
      return query;
    }

    return {
      ...query,
      userId: user.id,
    };
  }

  private assertCanViewExpense(
    user: AuthenticatedUser,
    expense: { userId: string },
  ) {
    if (!this.canViewAllExpenses(user) && expense.userId !== user.id) {
      throw new ForbiddenException('Cannot access another employee expense');
    }
  }

  private assertCanMutateExpense(
    user: AuthenticatedUser,
    expense: { userId: string },
  ) {
    if (expense.userId !== user.id) {
      throw new ForbiddenException('Only the creator can modify this expense');
    }
  }

  private assertPositiveAmount(amount: Prisma.Decimal) {
    if (amount.lte(0)) {
      throw new BadRequestException('Expense amount must be greater than zero');
    }
  }

  private assertValidAmountRange(query: ExpenseQueryDto) {
    if (
      query.minAmount !== undefined &&
      query.maxAmount !== undefined &&
      query.minAmount > query.maxAmount
    ) {
      throw new BadRequestException(
        'Minimum amount cannot be greater than maximum amount',
      );
    }
  }

  private assertExpensePaymentMethod(paymentMethod: PaymentMethod) {
    if (
      !(EXPENSE_PAYMENT_METHODS as readonly PaymentMethod[]).includes(
        paymentMethod,
      )
    ) {
      throw new BadRequestException(
        'Expense payment method must be CASH, BANK_TRANSFER, MOBILE_MONEY, or CARD',
      );
    }
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
