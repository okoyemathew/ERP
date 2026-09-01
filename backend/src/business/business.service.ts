import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';
import { UpdateReceiptSettingsDto } from './dto/update-receipt-settings.dto';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { BusinessLogoService } from './business-logo.service';
import { AuditLogService } from './audit-log.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  assertSupportedCurrency,
  DEFAULT_BUSINESS_CURRENCY,
} from '../common/currency';

@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessLogoService: BusinessLogoService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(createBusinessDto: CreateBusinessDto, user?: AuthenticatedUser) {
    const currency =
      assertSupportedCurrency(createBusinessDto.currency) ??
      DEFAULT_BUSINESS_CURRENCY;
    const business = await this.prisma.business.create({
      data: {
        ...createBusinessDto,
        currency,
        timezone: createBusinessDto.timezone ?? 'UTC',
      },
    });

    if (user) {
      await this.auditLogService.recordAudit({
        businessId: business.id,
        userId: user.id,
        action: AuditAction.CREATE,
        entity: 'Business',
        entityId: business.id,
        description: 'Created business profile',
      });
    }

    return business;
  }

  async findAll(user: AuthenticatedUser) {
    return this.prisma.business.findMany({
      where: { id: user.businessId },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    return this.ensureBusinessAccess(id, user);
  }

  async update(
    id: string,
    updateBusinessDto: UpdateBusinessDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureBusinessAccess(id, user);
    const { currency: requestedCurrency, timezone, ...businessData } =
      updateBusinessDto;
    const currency = assertSupportedCurrency(requestedCurrency);

    const business = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.business.update({
        where: { id },
        data: {
          ...businessData,
          ...(currency ? { currency } : {}),
          ...(timezone !== undefined ? { timezone } : {}),
        },
      });

      if (currency || timezone !== undefined) {
        await tx.businessSettings.upsert({
          where: { businessId: id },
          update: {
            ...(currency ? { currency } : {}),
            ...(timezone !== undefined ? { timezone } : {}),
          },
          create: {
            businessId: id,
            currency: currency ?? DEFAULT_BUSINESS_CURRENCY,
            timezone: timezone ?? 'UTC',
            language: 'en',
            allowCreditSales: true,
            enableOfflineMode: true,
          },
        });
      }

      return updated;
    });

    await this.auditLogService.recordAudit({
      businessId: id,
      userId: user.id,
      action: AuditAction.UPDATE,
      entity: 'Business',
      entityId: id,
      description: 'Updated business profile',
    });

    return business;
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.ensureBusinessAccess(id, user);

    const deleted = await this.prisma.business.delete({
      where: { id },
    });

    await this.auditLogService.recordAudit({
      businessId: id,
      userId: user.id,
      action: AuditAction.DELETE,
      entity: 'Business',
      entityId: id,
      description: 'Deleted business profile',
    });

    return deleted;
  }

  async profile(id: string, user?: AuthenticatedUser) {
    if (user) {
      await this.ensureBusinessAccess(id, user);
    }

    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        settings: true,
        receiptSettings: true,
        taxSettings: true,
        notificationSettings: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return business;
  }

  async getConfig(id: string, user: AuthenticatedUser) {
    await this.ensureBusinessAccess(id, user);

    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        settings: true,
        receiptSettings: true,
        taxSettings: true,
        notificationSettings: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return {
      business: {
        id: business.id,
        name: business.name,
        about: business.about,
        email: business.email,
        phone: business.phone,
        address: business.address,
        city: business.city,
        state: business.state,
        country: business.country,
        postalCode: business.postalCode,
        taxNumber: business.taxNumber,
        registrationNo: business.registrationNo,
        logo: business.logo,
        currency: business.currency,
        timezone: business.timezone,
      },
      settings: business.settings,
      receiptSettings: business.receiptSettings,
      taxSettings: business.taxSettings,
      notificationSettings: business.notificationSettings,
    };
  }

  async getDashboardSummary(id: string, user: AuthenticatedUser) {
    await this.ensureBusinessAccess(id, user);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const [
      salesToday,
      totalSales,
      paymentsToday,
      expensesToday,
      totalExpenses,
      creditBalance,
      todayCostRows,
      recentSales,
      employeeSales,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          businessId: id,
          status: 'COMPLETED',
          saleDate: { gte: todayStart, lte: todayEnd },
        },
        _count: true,
        _sum: {
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          totalAmount: true,
        },
      }),
      this.prisma.sale.aggregate({
        where: { businessId: id, status: 'COMPLETED' },
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          businessId: id,
          paymentDate: { gte: todayStart, lte: todayEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          businessId: id,
          deletedAt: null,
          expenseDate: { gte: todayStart, lte: todayEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { businessId: id, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.creditSale.aggregate({
        where: {
          sale: { businessId: id },
          balance: { gt: 0 },
          status: { not: 'PAID' },
        },
        _sum: { balance: true },
      }),
      this.prisma.$queryRaw<Array<{ costOfGoodsSold: Prisma.Decimal | null }>>`
          SELECT COALESCE(SUM(si.quantity * p."purchasePrice"), 0) AS "costOfGoodsSold"
          FROM "SaleItem" si
          JOIN "Sale" s ON s.id = si."saleId"
          JOIN "Product" p ON p.id = si."productId"
          WHERE s."businessId" = ${id}::uuid
            AND s.status = 'COMPLETED'::"SaleStatus"
            AND s."deletedAt" IS NULL
            AND s."saleDate" >= ${todayStart}
            AND s."saleDate" <= ${todayEnd}
        `,
      this.prisma.sale.findMany({
        where: { businessId: id, status: 'COMPLETED', deletedAt: null },
        include: {
          customer: true,
          items: { select: { id: true } },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
        orderBy: { saleDate: 'desc' },
        take: 20,
      }),
      this.prisma.sale.groupBy({
        by: ['userId'],
        where: {
          businessId: id,
          status: 'COMPLETED',
          saleDate: { gte: todayStart, lte: todayEnd },
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 5,
      }),
    ]);

    const [
      activeCustomers,
      activeSuppliers,
      totalProducts,
      lowStockProducts,
      activeBranches,
      activeUsers,
    ] = await Promise.all([
      this.prisma.customer.count({
        where: { businessId: id, status: 'ACTIVE' },
      }),
      this.prisma.supplier.count({
        where: { businessId: id, status: 'ACTIVE' },
      }),
      this.prisma.product.count({ where: { businessId: id, isActive: true } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Product" p
        LEFT JOIN "Inventory" i ON i."productId" = p.id
        WHERE p."businessId" = ${id}::uuid
          AND p."isActive" = true
          AND COALESCE(i."quantityAvailable", 0) <= p."minimumStock"
      `,
      this.prisma.branch.count({ where: { businessId: id, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { businessId: id, status: 'ACTIVE' } }),
    ]);

    const employeeUsers = employeeSales.length
      ? await this.prisma.user.findMany({
          where: { id: { in: employeeSales.map((row) => row.userId) } },
          select: { id: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const employeeById = new Map(employeeUsers.map((row) => [row.id, row]));
    const todayNetSales = new Prisma.Decimal(salesToday._sum.totalAmount ?? 0);
    const todayCostOfGoodsSold = new Prisma.Decimal(
      todayCostRows[0]?.costOfGoodsSold ?? 0,
    );
    const todayExpenseTotal = new Prisma.Decimal(
      expensesToday._sum.amount ?? 0,
    );
    const todayProfit = todayNetSales
      .sub(todayCostOfGoodsSold)
      .sub(todayExpenseTotal);

    return {
      totalSalesToday: salesToday._count ?? 0,
      totalRevenueToday: Number(salesToday._sum.totalAmount ?? 0),
      totalPaymentsToday: Number(paymentsToday._sum.amount ?? 0),
      totalExpensesToday: Number(expensesToday._sum.amount ?? 0),
      todayProfit: Number(todayProfit),
      costOfGoodsSoldToday: Number(todayCostOfGoodsSold),
      totalSales: Number(totalSales._sum.totalAmount ?? 0),
      totalOrders: totalSales._count ?? 0,
      totalProducts,
      outstandingCreditBalance: Number(creditBalance._sum?.balance ?? 0),
      totalExpenses: Number(totalExpenses._sum.amount ?? 0),
      activeCustomersCount: activeCustomers,
      activeSuppliersCount: activeSuppliers,
      availableProductsCount: totalProducts,
      lowStockProductsCount: Number(lowStockProducts[0]?.count ?? 0),
      branchesCount: activeBranches,
      activeUsersCount: activeUsers,
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate,
        customerName: sale.customer
          ? sale.customer.companyName ||
            [sale.customer.firstName, sale.customer.lastName]
              .filter(Boolean)
              .join(' ')
          : 'Walk-in Customer',
        itemCount: sale.items.length,
        totalAmount: Number(sale.totalAmount),
        employee: {
          id: sale.user.id,
          name: `${sale.user.firstName} ${sale.user.lastName}`.trim(),
          username: sale.user.username,
        },
      })),
      employeeSales: employeeSales.map((row) => {
        const employee = employeeById.get(row.userId);
        return {
          userId: row.userId,
          name: employee
            ? `${employee.firstName} ${employee.lastName}`.trim()
            : 'Unknown',
          username: employee?.username ?? null,
          salesCount: row._count._all,
          totalSales: Number(row._sum.totalAmount ?? 0),
        };
      }),
    };
  }

  async getDashboardStatistics(id: string, user: AuthenticatedUser) {
    await this.ensureBusinessAccess(id, user);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const [sales, payments, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          businessId: id,
          status: 'COMPLETED',
          saleDate: { gte: startDate, lte: endDate },
        },
        select: { saleDate: true, totalAmount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          businessId: id,
          paymentDate: { gte: startDate, lte: endDate },
        },
        select: { paymentDate: true, amount: true },
      }),
      this.prisma.expense.findMany({
        where: {
          businessId: id,
          deletedAt: null,
          expenseDate: { gte: startDate, lte: endDate },
        },
        select: { expenseDate: true, amount: true },
      }),
    ]);

    const salesByDate = new Map<
      string,
      { revenue: number; salesCount: number }
    >();
    const paymentsByDate = new Map<string, number>();
    const expensesByDate = new Map<string, number>();

    const formatDate = (date: Date) => date.toISOString().slice(0, 10);

    sales.forEach((sale) => {
      const key = formatDate(sale.saleDate);
      const existing = salesByDate.get(key) ?? { revenue: 0, salesCount: 0 };
      existing.revenue += Number(sale.totalAmount);
      existing.salesCount += 1;
      salesByDate.set(key, existing);
    });

    payments.forEach((payment) => {
      const key = formatDate(payment.paymentDate);
      paymentsByDate.set(
        key,
        (paymentsByDate.get(key) ?? 0) + Number(payment.amount),
      );
    });

    expenses.forEach((expense) => {
      const key = formatDate(expense.expenseDate);
      expensesByDate.set(
        key,
        (expensesByDate.get(key) ?? 0) + Number(expense.amount),
      );
    });

    const dailyRange = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      return date;
    });

    const salesLast7Days = dailyRange.map((date) => {
      const key = formatDate(date);
      const record = salesByDate.get(key) ?? { revenue: 0, salesCount: 0 };
      return {
        date: key,
        revenue: record.revenue,
        salesCount: record.salesCount,
      };
    });

    const paymentsLast7Days = dailyRange.map((date) => ({
      date: formatDate(date),
      amount: paymentsByDate.get(formatDate(date)) ?? 0,
    }));

    const expensesLast7Days = dailyRange.map((date) => ({
      date: formatDate(date),
      amount: expensesByDate.get(formatDate(date)) ?? 0,
    }));

    const totalRevenue = salesLast7Days.reduce(
      (sum, item) => sum + item.revenue,
      0,
    );

    const creditSalesBalance = await this.prisma.creditSale.aggregate({
      where: { sale: { businessId: id } },
      _sum: { balance: true },
    });

    return {
      salesLast7Days,
      paymentsLast7Days,
      expensesLast7Days,
      averageDailyRevenue: totalRevenue / 7,
      creditSalesBalance: Number(creditSalesBalance._sum?.balance ?? 0),
    };
  }

  async listAuditLogs(
    id: string,
    query: {
      page?: number;
      limit?: number;
      action?: Prisma.AuditLogWhereInput['action'];
      entity?: string;
      entityId?: string;
      userId?: string;
      deviceId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    user: AuthenticatedUser,
  ) {
    await this.ensureBusinessAccess(id, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.AuditLogWhereInput = {
      businessId: id,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      logs,
    };
  }

  async listRoles(id: string, user: AuthenticatedUser) {
    await this.ensureBusinessAccess(id, user);

    const roles = await this.prisma.role.findMany({
      where: { businessId: id },
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    return {
      data: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.rolePermissions.map(
          (rolePermission) => rolePermission.permission.name,
        ),
      })),
    };
  }

  async listPermissions(id: string, user: AuthenticatedUser) {
    await this.ensureBusinessAccess(id, user);

    const permissions = await this.prisma.permission.findMany({
      where: { businessId: id },
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });

    return { data: permissions };
  }

  async updateSettings(
    id: string,
    updateBusinessSettingsDto: UpdateBusinessSettingsDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureBusinessAccess(id, user);
    const currency = assertSupportedCurrency(
      updateBusinessSettingsDto.currency,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.businessSettings.upsert({
        where: { businessId: id },
        update: {
          currency,
          timezone: updateBusinessSettingsDto.timezone,
          language: updateBusinessSettingsDto.language,
          allowNegativeStock: updateBusinessSettingsDto.allowNegativeStock,
          allowCreditSales: updateBusinessSettingsDto.allowCreditSales,
          enableOfflineMode: updateBusinessSettingsDto.enableOfflineMode,
        },
        create: {
          businessId: id,
          currency: currency ?? DEFAULT_BUSINESS_CURRENCY,
          timezone: updateBusinessSettingsDto.timezone ?? 'UTC',
          language: updateBusinessSettingsDto.language ?? 'en',
          allowNegativeStock:
            updateBusinessSettingsDto.allowNegativeStock ?? false,
          allowCreditSales: updateBusinessSettingsDto.allowCreditSales ?? true,
          enableOfflineMode: updateBusinessSettingsDto.enableOfflineMode ?? true,
        },
      });

      if (currency || updateBusinessSettingsDto.timezone !== undefined) {
        await tx.business.update({
          where: { id },
          data: {
            ...(currency ? { currency } : {}),
            ...(updateBusinessSettingsDto.timezone !== undefined
              ? { timezone: updateBusinessSettingsDto.timezone }
              : {}),
          },
        });
      }

      return settings;
    });

    await this.auditLogService.recordAudit({
      businessId: id,
      userId: user.id,
      action: AuditAction.BUSINESS_SETTINGS_UPDATED,
      entity: 'BusinessSettings',
      entityId: id,
      description: 'Updated business settings',
    });

    return result;
  }

  async updateReceiptSettings(
    id: string,
    updateReceiptSettingsDto: UpdateReceiptSettingsDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureBusinessAccess(id, user);

    const result = await this.prisma.receiptSettings.upsert({
      where: { businessId: id },
      update: {
        businessName: updateReceiptSettingsDto.businessName,
        businessAddress: updateReceiptSettingsDto.businessAddress,
        businessPhone: updateReceiptSettingsDto.businessPhone,
        footerMessage: updateReceiptSettingsDto.footerMessage,
        autoPrint: updateReceiptSettingsDto.autoPrint,
        showLogo: updateReceiptSettingsDto.showLogo,
        paperWidth: updateReceiptSettingsDto.paperWidth,
      },
      create: {
        businessId: id,
        businessName: updateReceiptSettingsDto.businessName,
        businessAddress: updateReceiptSettingsDto.businessAddress,
        businessPhone: updateReceiptSettingsDto.businessPhone,
        footerMessage: updateReceiptSettingsDto.footerMessage,
        autoPrint: updateReceiptSettingsDto.autoPrint ?? false,
        showLogo: updateReceiptSettingsDto.showLogo ?? true,
        paperWidth: updateReceiptSettingsDto.paperWidth ?? '80mm',
      },
    });

    await this.auditLogService.recordAudit({
      businessId: id,
      userId: user.id,
      action: AuditAction.RECEIPT_SETTINGS_UPDATED,
      entity: 'ReceiptSettings',
      entityId: id,
      description: 'Updated receipt settings',
    });

    return result;
  }

  async updateTaxSettings(
    id: string,
    updateTaxSettingsDto: UpdateTaxSettingsDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureBusinessAccess(id, user);

    const result = await this.prisma.taxSettings.upsert({
      where: { businessId: id },
      update: {
        taxName: updateTaxSettingsDto.taxName,
        taxPercentage: updateTaxSettingsDto.taxPercentage,
        taxNumber: updateTaxSettingsDto.taxNumber,
        taxEnabled: updateTaxSettingsDto.taxEnabled,
      },
      create: {
        businessId: id,
        taxName: updateTaxSettingsDto.taxName ?? 'VAT',
        taxPercentage: updateTaxSettingsDto.taxPercentage ?? 0,
        taxNumber: updateTaxSettingsDto.taxNumber,
        taxEnabled: updateTaxSettingsDto.taxEnabled ?? false,
      },
    });

    await this.auditLogService.recordAudit({
      businessId: id,
      userId: user.id,
      action: AuditAction.TAX_SETTINGS_UPDATED,
      entity: 'TaxSettings',
      entityId: id,
      description: 'Updated tax settings',
    });

    return result;
  }

  async updateNotificationSettings(
    id: string,
    updateNotificationSettingsDto: UpdateNotificationSettingsDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureBusinessAccess(id, user);

    const result = await this.prisma.notificationSettings.upsert({
      where: { businessId: id },
      update: {
        lowStockAlert: updateNotificationSettingsDto.lowStockAlert,
        lowStockLevel: updateNotificationSettingsDto.lowStockLevel,
        dailySalesSummary: updateNotificationSettingsDto.dailySalesSummary,
        weeklySalesSummary: updateNotificationSettingsDto.weeklySalesSummary,
        monthlySalesSummary: updateNotificationSettingsDto.monthlySalesSummary,
        pushNotifications: updateNotificationSettingsDto.pushNotifications,
        emailNotifications: updateNotificationSettingsDto.emailNotifications,
      },
      create: {
        businessId: id,
        lowStockAlert: updateNotificationSettingsDto.lowStockAlert ?? true,
        lowStockLevel: updateNotificationSettingsDto.lowStockLevel ?? 5,
        dailySalesSummary:
          updateNotificationSettingsDto.dailySalesSummary ?? true,
        weeklySalesSummary:
          updateNotificationSettingsDto.weeklySalesSummary ?? true,
        monthlySalesSummary:
          updateNotificationSettingsDto.monthlySalesSummary ?? true,
        pushNotifications:
          updateNotificationSettingsDto.pushNotifications ?? true,
        emailNotifications:
          updateNotificationSettingsDto.emailNotifications ?? false,
      },
    });

    await this.auditLogService.recordAudit({
      businessId: id,
      userId: user.id,
      action: AuditAction.BUSINESS_SETTINGS_UPDATED,
      entity: 'NotificationSettings',
      entityId: id,
      description: 'Updated notification settings',
    });

    return result;
  }

  async prepareUploadLogo(
    id: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
    },
    user: AuthenticatedUser,
  ) {
    await this.ensureBusinessAccess(id, user);

    const upload = this.businessLogoService.prepareUpload(id, file);

    await this.auditLogService.recordAudit({
      businessId: id,
      userId: user.id,
      action: AuditAction.UPDATE,
      entity: 'BusinessLogo',
      entityId: id,
      description: 'Prepared business logo upload',
    });

    return upload;
  }

  private async ensureBusinessAccess(id: string, user: AuthenticatedUser) {
    if (user.businessId !== id) {
      throw new ForbiddenException('Access denied to this business');
    }

    return this.ensureExists(id);
  }

  private async ensureExists(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return business;
  }
}
