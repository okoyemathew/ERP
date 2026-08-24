import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AuditAction,
  CreditSaleStatus,
  InventoryTransactionType,
  PaymentMethod,
  Prisma,
  PurchaseOrderStatus,
  SaleStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreditReportQueryDto } from './dto/credit-report-query.dto';
import { ExpenseReportQueryDto } from './dto/expense-report-query.dto';
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto';
import { PaymentReportQueryDto } from './dto/payment-report-query.dto';
import { ReportDatePreset } from './dto/report-date-range.dto';
import { ReportPeriod } from './dto/report-period.dto';
import { SalesReportQueryDto } from './dto/sales-report-query.dto';
import { SupplierReportQueryDto } from './dto/supplier-report-query.dto';

type SalesSummary = {
  totalSales: string;
  transactionCount: number;
  totalQuantitySold: number;
  grossSales: string;
  totalDiscounts: string;
  totalTax: string;
  netSales: string;
  amountPaid: string;
  outstandingAmount: string;
  averageTransactionValue: string;
};

type PeriodSalesRow = {
  periodStart: Date;
  transactionCount: bigint | number;
  totalQuantitySold: bigint | number | null;
  grossSales: Prisma.Decimal | string | number | null;
  totalDiscounts: Prisma.Decimal | string | number | null;
  totalTax: Prisma.Decimal | string | number | null;
  totalSales: Prisma.Decimal | string | number | null;
  amountPaid: Prisma.Decimal | string | number | null;
  outstandingAmount: Prisma.Decimal | string | number | null;
};

type PeriodExpenseRow = {
  periodStart: Date;
  expenseCount: bigint | number;
  totalAmount: Prisma.Decimal | string | number | null;
};

type ProfitCogRow = {
  costOfGoodsSold: Prisma.Decimal | string | number | null;
};

type InventoryValueRow = {
  inventoryValue: Prisma.Decimal | string | number | null;
};

type InventoryMovementAggregateRow = {
  stockInQuantity: bigint | number | null;
  stockOutQuantity: bigint | number | null;
  adjustmentQuantity: bigint | number | null;
  adjustmentCount: bigint | number | null;
};

type CustomerCreditRow = {
  customerId: string;
  creditSaleCount: bigint | number;
  totalCredit: Prisma.Decimal | string | number | null;
  totalCollected: Prisma.Decimal | string | number | null;
  outstandingBalance: Prisma.Decimal | string | number | null;
  overdueBalance: Prisma.Decimal | string | number | null;
  customerName: string | null;
  customerPhone: string | null;
};

type EmployeeSalesRow = {
  employeeId: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  userId: string;
  transactionCount: bigint | number;
  quantitySold: bigint | number | null;
  grossSales: Prisma.Decimal | string | number | null;
  discount: Prisma.Decimal | string | number | null;
  tax: Prisma.Decimal | string | number | null;
  netSales: Prisma.Decimal | string | number | null;
};

type TopSellingProductRow = {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: bigint | number | null;
  netSales: Prisma.Decimal | string | number | null;
};

type ReportFilterSource = Partial<
  SalesReportQueryDto &
    PaymentReportQueryDto &
    ExpenseReportQueryDto &
    InventoryReportQueryDto &
    CreditReportQueryDto &
    SupplierReportQueryDto
>;

const PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.MOBILE_MONEY,
  PaymentMethod.CREDIT,
] as const;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailySalesReport(
    businessId: string,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    return this.getSalesPeriodReport(businessId, 'day', query, user);
  }

  async getWeeklySalesReport(
    businessId: string,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    return this.getSalesPeriodReport(businessId, 'week', query, user);
  }

  async getMonthlySalesReport(
    businessId: string,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    return this.getSalesPeriodReport(businessId, 'month', query, user);
  }

  async getYearlySalesReport(
    businessId: string,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    return this.getSalesPeriodReport(businessId, 'year', query, user);
  }

  async getSalesPeriodReport(
    businessId: string,
    period: ReportPeriod,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const timezone = await this.getBusinessTimezone(businessId);
    const normalizedQuery = {
      ...query,
      ...this.resolveDateRange(query, period, timezone),
    };

    const [summary, paymentBreakdown, data] = await Promise.all([
      this.salesSummary(businessId, normalizedQuery),
      this.paymentBreakdown(businessId, normalizedQuery),
      this.periodSalesData(businessId, period, timezone, normalizedQuery),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      `${period.toUpperCase()} Sales Report`,
      normalizedQuery,
    );

    return {
      reportType: `${period}_sales`,
      period,
      timezone,
      range: this.responseRange(normalizedQuery),
      filters: this.responseFilters(normalizedQuery),
      summary,
      paymentBreakdown,
      data,
    };
  }

  async getCustomSalesReport(
    businessId: string,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException(
        'startDate and endDate are required for a custom sales report',
      );
    }

    this.assertValidRange(query.startDate, query.endDate);
    const timezone = await this.getBusinessTimezone(businessId);

    const [summary, paymentBreakdown] = await Promise.all([
      this.salesSummary(businessId, query),
      this.paymentBreakdown(businessId, query),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Custom Sales Report',
      query,
    );

    return {
      reportType: 'custom_sales',
      timezone,
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary,
      paymentBreakdown,
    };
  }

  async getPaymentMethodReport(
    businessId: string,
    query: PaymentReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const where = this.buildPaymentWhere(businessId, query);

    const grouped = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where,
      _count: { _all: true },
      _sum: { amount: true },
      orderBy: { paymentMethod: 'asc' },
    });

    const byMethod = new Map(
      grouped.map((row) => [
        row.paymentMethod,
        {
          paymentMethod: row.paymentMethod,
          transactionCount: row._count._all,
          totalAmount: this.money(row._sum.amount),
        },
      ]),
    );

    const data = PAYMENT_METHODS.map(
      (paymentMethod) =>
        byMethod.get(paymentMethod) ?? {
          paymentMethod,
          transactionCount: 0,
          totalAmount: this.money(0),
        },
    );

    await this.auditReportAccess(
      businessId,
      user.id,
      'Payment Method Report',
      query,
    );

    return {
      reportType: 'payment_method',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary: {
        transactionCount: data.reduce(
          (total, row) => total + row.transactionCount,
          0,
        ),
        totalAmount: this.money(
          data.reduce(
            (total, row) => total.add(row.totalAmount),
            new Prisma.Decimal(0),
          ),
        ),
      },
      data,
    };
  }

  async getEmployeeSalesReport(
    businessId: string,
    period: ReportPeriod,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const timezone = await this.getBusinessTimezone(businessId);
    const normalizedQuery = {
      ...query,
      ...this.resolveDateRange(query, period, timezone),
    };

    const [summary, data, periodData] = await Promise.all([
      this.salesSummary(businessId, normalizedQuery),
      this.employeeSalesData(businessId, normalizedQuery),
      this.employeeSalesPeriodData(
        businessId,
        period,
        timezone,
        normalizedQuery,
      ),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      `${period.toUpperCase()} Employee Sales Report`,
      normalizedQuery,
    );

    return {
      reportType: `${period}_employee_sales`,
      period,
      timezone,
      range: this.responseRange(normalizedQuery),
      filters: this.responseFilters(normalizedQuery),
      summary,
      data,
      periodData,
      exportReady: true,
    };
  }

  async getBusinessSummary(
    businessId: string,
    user: AuthenticatedUser,
    query: SalesReportQueryDto = {},
  ) {
    const timezone = await this.getBusinessTimezone(businessId);
    const todayRange = this.resolveDateRange(
      { ...query, datePreset: 'today' },
      'day',
      timezone,
    );
    const todayQuery = { ...query, ...todayRange };

    const [
      todaySales,
      todayExpenses,
      todayCogs,
      outstandingCredit,
      lowStockCount,
      outOfStockCount,
      topSellingProducts,
      topPerformingEmployees,
    ] = await Promise.all([
      this.salesSummary(businessId, todayQuery),
      this.expenseSummary(this.buildExpenseWhere(businessId, todayQuery)),
      this.historicalCostOfGoodsSold(businessId, todayQuery),
      this.prisma.creditSale.aggregate({
        where: {
          sale: { businessId, deletedAt: null },
          balance: { gt: 0 },
          status: { not: CreditSaleStatus.PAID },
        },
        _sum: { balance: true },
        _count: { _all: true },
      }),
      this.countLowStockProducts(businessId, {}),
      this.countOutOfStockProducts(businessId, {}),
      this.topSellingProducts(businessId, todayQuery, 5),
      this.employeeSalesData(businessId, todayQuery, 5),
    ]);

    const netSales = this.decimal(todaySales.netSales);
    const grossProfit = netSales.sub(todayCogs);
    const todayProfit = grossProfit.sub(todayExpenses.totalExpenses);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Business Report Summary',
      todayQuery,
    );

    return {
      reportType: 'business_summary',
      timezone,
      range: this.responseRange(todayQuery),
      summary: {
        todaySales: todaySales.totalSales,
        todayTransactions: todaySales.transactionCount,
        todayExpenses: todayExpenses.totalExpenses,
        todayProfit: this.money(todayProfit),
        outstandingCredit: this.money(outstandingCredit._sum.balance),
        outstandingCreditAccounts: outstandingCredit._count._all,
        lowStockCount,
        outOfStockCount,
      },
      topSellingProducts,
      topPerformingEmployees,
      exportReady: true,
    };
  }

  async getProfitReport(
    businessId: string,
    query: SalesReportQueryDto,
    user: AuthenticatedUser,
  ) {
    if (query.startDate && query.endDate) {
      this.assertValidRange(query.startDate, query.endDate);
    }
    const timezone = await this.getBusinessTimezone(businessId);
    const normalizedQuery =
      query.startDate || query.endDate
        ? query
        : { ...query, ...this.resolveDateRange(query, 'day', timezone) };

    const [sales, costOfGoodsSold, expenses] = await Promise.all([
      this.prisma.sale.aggregate({
        where: this.buildSaleWhere(businessId, normalizedQuery),
        _sum: {
          subtotal: true,
          discountAmount: true,
        },
      }),
      this.historicalCostOfGoodsSold(businessId, normalizedQuery),
      this.prisma.expense.aggregate({
        where: this.buildExpenseWhere(businessId, {
          startDate: normalizedQuery.startDate,
          endDate: normalizedQuery.endDate,
        }),
        _sum: { amount: true },
      }),
    ]);

    const grossRevenue = this.decimal(sales._sum.subtotal);
    const discounts = this.decimal(sales._sum.discountAmount);
    const netSales = grossRevenue.sub(discounts);
    const cogs = this.decimal(costOfGoodsSold);
    const grossProfit = netSales.sub(cogs);
    const totalExpenses = this.decimal(expenses._sum.amount);
    const netProfit = grossProfit.sub(totalExpenses);
    const profitMargin = netSales.gt(0)
      ? netProfit.div(netSales).mul(100)
      : new Prisma.Decimal(0);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Profit Report',
      normalizedQuery,
    );

    return {
      reportType: 'profit',
      timezone,
      range: this.responseRange(normalizedQuery),
      filters: this.responseFilters(normalizedQuery),
      summary: {
        grossRevenue: this.money(grossRevenue),
        costOfGoodsSold: this.money(cogs),
        grossProfit: this.money(grossProfit),
        totalExpenses: this.money(totalExpenses),
        netProfit: this.money(netProfit),
        profitMargin: profitMargin.toFixed(2),
      },
      notes: {
        costBasis:
          'COGS uses historical sale inventory movement cost when available, then prior stock-in/purchase/goods supplied costs. Current Product.purchasePrice is not used.',
      },
    };
  }

  async getExpenseReport(
    businessId: string,
    period: ReportPeriod,
    query: ExpenseReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const timezone = await this.getBusinessTimezone(businessId);
    const normalizedQuery = {
      ...query,
      ...this.resolveDateRange(query, period, timezone),
    };
    const where = this.buildExpenseWhere(businessId, normalizedQuery);

    const [summary, data] = await Promise.all([
      this.expenseSummary(where),
      this.periodExpenseData(businessId, period, timezone, normalizedQuery),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      `${period.toUpperCase()} Expense Report`,
      normalizedQuery,
    );

    return {
      reportType: `${period}_expenses`,
      period,
      timezone,
      range: this.responseRange(normalizedQuery),
      filters: this.responseFilters(normalizedQuery),
      summary,
      data,
    };
  }

  async getCustomExpenseReport(
    businessId: string,
    query: ExpenseReportQueryDto,
    user: AuthenticatedUser,
  ) {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException(
        'startDate and endDate are required for a custom expense report',
      );
    }

    this.assertValidRange(query.startDate, query.endDate);
    const timezone = await this.getBusinessTimezone(businessId);

    const summary = await this.expenseSummary(
      this.buildExpenseWhere(businessId, query),
    );

    await this.auditReportAccess(
      businessId,
      user.id,
      'Custom Expense Report',
      query,
    );

    return {
      reportType: 'custom_expenses',
      timezone,
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary,
    };
  }

  async getInventoryReport(
    businessId: string,
    query: InventoryReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const inventoryWhere = this.buildInventoryWhere(businessId, query);

    const [
      productCount,
      stockTotals,
      lowStockCount,
      outOfStockCount,
      inventoryValue,
      movementTotals,
      adjustmentTotals,
    ] = await Promise.all([
      this.prisma.product.count({
        where: this.buildProductWhere(businessId, query),
      }),
      this.prisma.inventory.aggregate({
        where: inventoryWhere,
        _sum: {
          quantityOnHand: true,
          quantityAvailable: true,
          quantityReserved: true,
        },
      }),
      this.countLowStockProducts(businessId, query),
      this.countOutOfStockProducts(businessId, query),
      this.currentInventoryValue(businessId, query),
      this.inventoryMovementTotals(businessId, query),
      this.prisma.stockAdjustment.aggregate({
        where: {
          businessId,
          ...(query.productId ? { productId: query.productId } : {}),
          ...(query.startDate || query.endDate
            ? {
                adjustmentDate: {
                  ...(query.startDate ? { gte: query.startDate } : {}),
                  ...(query.endDate ? { lte: query.endDate } : {}),
                },
              }
            : {}),
          ...(query.categoryId || query.supplierId || query.search?.trim()
            ? {
                product: {
                  ...this.buildProductWhere(businessId, query),
                },
              }
            : {}),
        },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Inventory Report',
      query,
    );

    return {
      reportType: 'inventory',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary: {
        totalProducts: productCount,
        totalStockQuantity: stockTotals._sum.quantityOnHand ?? 0,
        totalAvailableQuantity: stockTotals._sum.quantityAvailable ?? 0,
        totalReservedQuantity: stockTotals._sum.quantityReserved ?? 0,
        lowStockProducts: lowStockCount,
        outOfStockProducts: outOfStockCount,
        inventoryValue: this.money(inventoryValue),
        stockInQuantity: this.toNumber(movementTotals.stockInQuantity),
        stockOutQuantity: this.toNumber(movementTotals.stockOutQuantity),
        stockAdjustments: {
          count: adjustmentTotals._count._all,
          quantity: adjustmentTotals._sum.quantity ?? 0,
          movementQuantity: this.toNumber(movementTotals.adjustmentQuantity),
          movementCount: this.toNumber(movementTotals.adjustmentCount),
        },
      },
    };
  }

  async getInventoryMovementHistory(
    businessId: string,
    query: InventoryReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildInventoryMovementWhere(businessId, query);

    const [total, rows] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where }),
      this.prisma.inventoryTransaction.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: {
          [query.sortBy ?? 'transactionDate']: query.sortOrder ?? 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Inventory Movement History Report',
      query,
    );

    return {
      reportType: 'inventory_movement_history',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      data: rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        product: row.product,
        transactionType: row.transactionType,
        quantity: row.quantity,
        quantityBefore: row.quantityBefore,
        quantityAfter: row.quantityAfter,
        unitCost: this.money(row.unitCost),
        referenceNumber: row.referenceNumber,
        remarks: row.remarks,
        transactionDate: row.transactionDate,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCreditReport(
    businessId: string,
    query: CreditReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const where = this.buildCreditWhere(businessId, query);
    const outstandingWhere: Prisma.CreditSaleWhereInput = {
      AND: [
        where,
        { balance: { gt: 0 }, status: { not: CreditSaleStatus.PAID } },
      ],
    };
    const partiallyPaidWhere: Prisma.CreditSaleWhereInput = {
      AND: [where, { status: CreditSaleStatus.PARTIALLY_PAID }],
    };
    const paidWhere: Prisma.CreditSaleWhereInput = {
      AND: [where, { status: CreditSaleStatus.PAID }],
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

    const [totals, outstanding, partiallyPaid, paid, overdue] =
      await Promise.all([
        this.prisma.creditSale.aggregate({
          where,
          _count: { _all: true },
          _sum: { totalCredit: true, amountPaid: true, balance: true },
        }),
        this.prisma.creditSale.aggregate({
          where: outstandingWhere,
          _count: { _all: true },
          _sum: { balance: true },
        }),
        this.prisma.creditSale.aggregate({
          where: partiallyPaidWhere,
          _count: { _all: true },
          _sum: { totalCredit: true, amountPaid: true, balance: true },
        }),
        this.prisma.creditSale.aggregate({
          where: paidWhere,
          _count: { _all: true },
          _sum: { totalCredit: true, amountPaid: true },
        }),
        this.prisma.creditSale.aggregate({
          where: overdueWhere,
          _count: { _all: true },
          _sum: { balance: true, totalCredit: true },
        }),
      ]);

    await this.auditReportAccess(businessId, user.id, 'Credit Report', query);

    return {
      reportType: 'credit',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary: {
        totalCreditSales: {
          count: totals._count._all,
          amount: this.money(totals._sum.totalCredit),
        },
        totalCreditCollected: this.money(totals._sum.amountPaid),
        totalOutstandingCredit: this.money(outstanding._sum.balance),
        partiallyPaidCredit: {
          count: partiallyPaid._count._all,
          totalCredit: this.money(partiallyPaid._sum.totalCredit),
          collected: this.money(partiallyPaid._sum.amountPaid),
          outstanding: this.money(partiallyPaid._sum.balance),
        },
        fullyPaidCredit: {
          count: paid._count._all,
          amount: this.money(paid._sum.totalCredit),
          collected: this.money(paid._sum.amountPaid),
        },
        overdueCredit: {
          count: overdue._count._all,
          amount: this.money(overdue._sum.balance),
          originalCredit: this.money(overdue._sum.totalCredit),
        },
      },
    };
  }

  async getCreditByCustomerReport(
    businessId: string,
    query: CreditReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const rows = await this.prisma.$queryRaw<CustomerCreditRow[]>`
      SELECT
        cs."customerId" AS "customerId",
        COUNT(*)::bigint AS "creditSaleCount",
        COALESCE(SUM(cs."totalCredit"), 0) AS "totalCredit",
        COALESCE(SUM(cs."amountPaid"), 0) AS "totalCollected",
        COALESCE(SUM(cs."balance"), 0) AS "outstandingBalance",
        COALESCE(SUM(
          CASE
            WHEN cs."balance" > 0
              AND cs."dueDate" < NOW()
              AND cs."status" <> ${CreditSaleStatus.PAID}::"CreditSaleStatus"
            THEN cs."balance"
            ELSE 0
          END
        ), 0) AS "overdueBalance",
        COALESCE(NULLIF(c."companyName", ''), CONCAT_WS(' ', c."firstName", c."lastName")) AS "customerName",
        c."phone" AS "customerPhone"
      FROM "CreditSale" cs
      JOIN "Sale" s ON s.id = cs."saleId"
      JOIN "Customer" c ON c.id = cs."customerId"
      WHERE ${this.buildRawCreditWhere(businessId, query, 'cs', 's', 'c')}
      GROUP BY cs."customerId", c."companyName", c."firstName", c."lastName", c."phone"
      ORDER BY "outstandingBalance" DESC
    `;

    await this.auditReportAccess(
      businessId,
      user.id,
      'Credit By Customer Report',
      query,
    );

    return {
      reportType: 'credit_by_customer',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      data: rows.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        creditSaleCount: this.toNumber(row.creditSaleCount),
        totalCredit: this.money(row.totalCredit),
        totalCollected: this.money(row.totalCollected),
        outstandingBalance: this.money(row.outstandingBalance),
        overdueBalance: this.money(row.overdueBalance),
      })),
    };
  }

  async getCreditPaymentHistoryReport(
    businessId: string,
    query: CreditReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildCreditPaymentWhere(businessId, query);

    const [summary, total, payments] = await Promise.all([
      this.prisma.creditPayment.aggregate({
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.creditPayment.count({ where }),
      this.prisma.creditPayment.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              companyName: true,
              phone: true,
            },
          },
          creditSale: {
            include: {
              sale: { select: { id: true, saleNumber: true, saleDate: true } },
            },
          },
        },
        orderBy: { paymentDate: query.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Credit Payment History Report',
      query,
    );

    return {
      reportType: 'credit_payment_history',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary: {
        paymentCount: summary._count._all,
        totalCollected: this.money(summary._sum.amount),
      },
      data: payments.map((payment) => ({
        id: payment.id,
        creditSaleId: payment.creditSaleId,
        saleNumber: payment.creditSale.sale.saleNumber,
        customerId: payment.customerId,
        customerName: this.customerName(payment.customer),
        paymentMethod: payment.paymentMethod,
        amount: this.money(payment.amount),
        referenceNumber: payment.referenceNumber,
        notes: payment.notes,
        paymentDate: payment.paymentDate,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSupplierReport(
    businessId: string,
    query: SupplierReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const supplierWhere = this.buildSupplierWhere(businessId, query);
    const purchaseWhere = this.buildPurchaseOrderWhere(businessId, query);
    const goodsWhere = this.buildGoodsSuppliedWhere(businessId, query);

    const [
      supplierTotals,
      purchaseTotals,
      goodsCount,
      goodsAmount,
      outstandingSuppliers,
    ] = await Promise.all([
      this.prisma.supplier.aggregate({
        where: supplierWhere,
        _count: { _all: true },
        _sum: { outstandingBalance: true },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: purchaseWhere,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.goodsSupplied.count({ where: goodsWhere }),
      this.prisma.goodsSuppliedItem.aggregate({
        where: { goodsSupplied: goodsWhere },
        _sum: { totalCost: true, quantity: true },
      }),
      this.prisma.supplier.findMany({
        where: {
          ...supplierWhere,
          outstandingBalance: { gt: 0 },
        },
        select: {
          id: true,
          supplierCode: true,
          companyName: true,
          phone: true,
          outstandingBalance: true,
          status: true,
        },
        orderBy: { outstandingBalance: 'desc' },
        take: 20,
      }),
    ]);

    await this.auditReportAccess(businessId, user.id, 'Supplier Report', query);

    return {
      reportType: 'supplier',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary: {
        supplierCount: supplierTotals._count._all,
        totalPurchases: {
          count: purchaseTotals._count._all,
          amount: this.money(purchaseTotals._sum.totalAmount),
        },
        totalGoodsSupplied: {
          count: goodsCount,
          quantity: goodsAmount._sum.quantity ?? 0,
          amount: this.money(goodsAmount._sum.totalCost),
        },
        supplierOutstandingBalances: this.money(
          supplierTotals._sum.outstandingBalance,
        ),
      },
      outstandingSuppliers: outstandingSuppliers.map((supplier) => ({
        id: supplier.id,
        supplierCode: supplier.supplierCode,
        companyName: supplier.companyName,
        phone: supplier.phone,
        outstandingBalance: this.money(supplier.outstandingBalance),
        status: supplier.status,
      })),
    };
  }

  async getSupplierPurchaseHistoryReport(
    businessId: string,
    query: SupplierReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const purchaseWhere = this.buildPurchaseOrderWhere(businessId, query);

    const [summary, total, rows] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where: purchaseWhere,
        _count: { _all: true },
        _sum: {
          subtotal: true,
          taxAmount: true,
          discountAmount: true,
          totalAmount: true,
        },
      }),
      this.prisma.purchaseOrder.count({ where: purchaseWhere }),
      this.prisma.purchaseOrder.findMany({
        where: purchaseWhere,
        include: {
          supplier: {
            select: {
              id: true,
              supplierCode: true,
              companyName: true,
              phone: true,
            },
          },
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
        orderBy: { orderDate: query.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Supplier Purchase History Report',
      query,
    );

    return {
      reportType: 'supplier_purchase_history',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      summary: {
        purchaseCount: summary._count._all,
        subtotal: this.money(summary._sum.subtotal),
        taxAmount: this.money(summary._sum.taxAmount),
        discountAmount: this.money(summary._sum.discountAmount),
        totalPurchases: this.money(summary._sum.totalAmount),
      },
      data: rows.map((purchase) => ({
        id: purchase.id,
        supplier: purchase.supplier,
        orderNumber: purchase.orderNumber,
        orderDate: purchase.orderDate,
        expectedDate: purchase.expectedDate,
        status: purchase.status,
        subtotal: this.money(purchase.subtotal),
        taxAmount: this.money(purchase.taxAmount),
        discountAmount: this.money(purchase.discountAmount),
        totalAmount: this.money(purchase.totalAmount),
        items: purchase.items.map((item) => ({
          ...item,
          unitPrice: this.money(item.unitPrice),
          totalPrice: this.money(item.totalPrice),
        })),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSupplierPaymentHistoryReport(
    businessId: string,
    query: SupplierReportQueryDto,
    user: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      businessId,
      entity: 'SupplierPayment',
      action: AuditAction.UPDATE,
      ...(query.supplierId ? { entityId: query.supplierId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            description: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
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
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    await this.auditReportAccess(
      businessId,
      user.id,
      'Supplier Payment History Report',
      query,
    );

    return {
      reportType: 'supplier_payment_history',
      range: this.responseRange(query),
      filters: this.responseFilters(query),
      source: 'AuditLog.SupplierPayment',
      data: logs.map((log) => ({
        id: log.id,
        supplierId: log.entityId,
        description: log.description,
        recordedBy: log.user
          ? {
              id: log.user.id,
              name: `${log.user.firstName} ${log.user.lastName}`.trim(),
              username: log.user.username,
            }
          : null,
        recordedAt: log.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async salesSummary(
    businessId: string,
    query: SalesReportQueryDto,
  ): Promise<SalesSummary> {
    const saleWhere = this.buildSaleWhere(businessId, query);
    const saleItemWhere = this.buildSaleItemWhere(saleWhere, query);

    const [sales, quantity] = await Promise.all([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _count: { _all: true },
        _sum: {
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
        },
      }),
      this.prisma.saleItem.aggregate({
        where: saleItemWhere,
        _sum: { quantity: true },
      }),
    ]);

    const transactionCount = sales._count._all;
    const grossSales = this.decimal(sales._sum.subtotal);
    const totalDiscounts = this.decimal(sales._sum.discountAmount);
    const totalTax = this.decimal(sales._sum.taxAmount);
    const totalSales = this.decimal(sales._sum.totalAmount);
    const amountPaid = this.decimal(sales._sum.amountPaid);
    const outstandingAmount = this.decimal(sales._sum.balanceDue);
    const netSales = grossSales.sub(totalDiscounts);

    return {
      totalSales: this.money(totalSales),
      transactionCount,
      totalQuantitySold: quantity._sum.quantity ?? 0,
      grossSales: this.money(grossSales),
      totalDiscounts: this.money(totalDiscounts),
      totalTax: this.money(totalTax),
      netSales: this.money(netSales),
      amountPaid: this.money(amountPaid),
      outstandingAmount: this.money(outstandingAmount),
      averageTransactionValue: this.money(
        transactionCount > 0
          ? totalSales.div(transactionCount)
          : new Prisma.Decimal(0),
      ),
    };
  }

  private async paymentBreakdown(
    businessId: string,
    query: SalesReportQueryDto,
  ) {
    const paymentWhere = this.buildPaymentWhere(businessId, query);
    const grouped = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: paymentWhere,
      _count: { _all: true },
      _sum: { amount: true },
      orderBy: { paymentMethod: 'asc' },
    });

    const byMethod = new Map(
      grouped.map((row) => [
        row.paymentMethod,
        {
          paymentMethod: row.paymentMethod,
          transactionCount: row._count._all,
          totalAmount: this.money(row._sum.amount),
        },
      ]),
    );

    return PAYMENT_METHODS.map(
      (paymentMethod) =>
        byMethod.get(paymentMethod) ?? {
          paymentMethod,
          transactionCount: 0,
          totalAmount: this.money(0),
        },
    );
  }

  private async periodSalesData(
    businessId: string,
    period: ReportPeriod,
    timezone: string,
    query: SalesReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<PeriodSalesRow[]>`
      WITH sale_base AS (
        SELECT
          s.id,
          s."saleDate",
          s."subtotal",
          s."discountAmount",
          s."taxAmount",
          s."totalAmount",
          s."amountPaid",
          s."balanceDue"
        FROM "Sale" s
        LEFT JOIN "Customer" c ON c.id = s."customerId"
        JOIN "User" u ON u.id = s."userId"
        LEFT JOIN "Employee" e ON e."userId" = u.id
        WHERE ${this.buildRawSaleWhere(businessId, query)}
      ),
      item_totals AS (
        SELECT
          si."saleId",
          COALESCE(SUM(si."quantity"), 0)::bigint AS "quantitySold"
        FROM "SaleItem" si
        JOIN "Product" p ON p.id = si."productId"
        LEFT JOIN "Category" cat ON cat.id = p."categoryId"
        WHERE si."saleId" IN (SELECT id FROM sale_base)
          ${this.buildRawItemFilter(query)}
        GROUP BY si."saleId"
      )
      SELECT
        date_trunc(${period}, sb."saleDate" AT TIME ZONE ${timezone}) AS "periodStart",
        COUNT(DISTINCT sb.id)::bigint AS "transactionCount",
        COALESCE(SUM(it."quantitySold"), 0)::bigint AS "totalQuantitySold",
        COALESCE(SUM(sb."subtotal"), 0) AS "grossSales",
        COALESCE(SUM(sb."discountAmount"), 0) AS "totalDiscounts",
        COALESCE(SUM(sb."taxAmount"), 0) AS "totalTax",
        COALESCE(SUM(sb."totalAmount"), 0) AS "totalSales",
        COALESCE(SUM(sb."amountPaid"), 0) AS "amountPaid",
        COALESCE(SUM(sb."balanceDue"), 0) AS "outstandingAmount"
      FROM sale_base sb
      LEFT JOIN item_totals it ON it."saleId" = sb.id
      GROUP BY 1
      ORDER BY "periodStart" ASC
    `;

    return rows.map((row) => {
      const transactionCount = this.toNumber(row.transactionCount);
      const totalSales = this.decimal(row.totalSales);
      const grossSales = this.decimal(row.grossSales);
      const totalDiscounts = this.decimal(row.totalDiscounts);

      return {
        periodStart: row.periodStart,
        transactionCount,
        totalQuantitySold: this.toNumber(row.totalQuantitySold),
        grossSales: this.money(grossSales),
        totalDiscounts: this.money(totalDiscounts),
        totalTax: this.money(row.totalTax),
        netSales: this.money(grossSales.sub(totalDiscounts)),
        totalSales: this.money(totalSales),
        amountPaid: this.money(row.amountPaid),
        outstandingAmount: this.money(row.outstandingAmount),
        averageTransactionValue: this.money(
          transactionCount > 0
            ? totalSales.div(transactionCount)
            : new Prisma.Decimal(0),
        ),
      };
    });
  }

  private async employeeSalesData(
    businessId: string,
    query: SalesReportQueryDto,
    limit?: number,
  ) {
    const take = limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<EmployeeSalesRow[]>`
      WITH sale_base AS (
        SELECT
          s.id,
          s."subtotal",
          s."discountAmount",
          s."taxAmount",
          s."totalAmount",
          u.id AS "userId",
          COALESCE(e.id::text, NULL) AS "employeeId",
          COALESCE(
            NULLIF(CONCAT_WS(' ', e."firstName", e."lastName"), ''),
            NULLIF(CONCAT_WS(' ', u."firstName", u."lastName"), ''),
            u.username
          ) AS "employeeName",
          e."employeeCode" AS "employeeCode"
        FROM "Sale" s
        LEFT JOIN "Customer" c ON c.id = s."customerId"
        JOIN "User" u ON u.id = s."userId"
        LEFT JOIN "Employee" e ON e."userId" = u.id
        WHERE ${this.buildRawSaleWhere(businessId, query)}
      ),
      item_totals AS (
        SELECT
          si."saleId",
          COALESCE(SUM(si.quantity), 0)::bigint AS "quantitySold"
        FROM "SaleItem" si
        JOIN "Product" p ON p.id = si."productId"
        LEFT JOIN "Category" cat ON cat.id = p."categoryId"
        WHERE si."saleId" IN (SELECT id FROM sale_base)
          ${this.buildRawItemFilter(query)}
        GROUP BY si."saleId"
      )
      SELECT
        sb."employeeId",
        sb."employeeName",
        sb."employeeCode",
        sb."userId",
        COUNT(DISTINCT sb.id)::bigint AS "transactionCount",
        COALESCE(SUM(it."quantitySold"), 0)::bigint AS "quantitySold",
        COALESCE(SUM(sb."subtotal"), 0) AS "grossSales",
        COALESCE(SUM(sb."discountAmount"), 0) AS "discount",
        COALESCE(SUM(sb."taxAmount"), 0) AS "tax",
        COALESCE(SUM(sb."totalAmount"), 0) AS "netSales"
      FROM sale_base sb
      LEFT JOIN item_totals it ON it."saleId" = sb.id
      GROUP BY sb."employeeId", sb."employeeName", sb."employeeCode", sb."userId"
      ORDER BY "netSales" DESC
      ${take}
    `;

    return rows.map((row) => this.formatEmployeeSalesRow(row));
  }

  private async employeeSalesPeriodData(
    businessId: string,
    period: ReportPeriod,
    timezone: string,
    query: SalesReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<EmployeeSalesRow & { periodStart: Date }>
    >`
      WITH sale_base AS (
        SELECT
          s.id,
          s."saleDate",
          s."subtotal",
          s."discountAmount",
          s."taxAmount",
          s."totalAmount",
          u.id AS "userId",
          COALESCE(e.id::text, NULL) AS "employeeId",
          COALESCE(
            NULLIF(CONCAT_WS(' ', e."firstName", e."lastName"), ''),
            NULLIF(CONCAT_WS(' ', u."firstName", u."lastName"), ''),
            u.username
          ) AS "employeeName",
          e."employeeCode" AS "employeeCode"
        FROM "Sale" s
        LEFT JOIN "Customer" c ON c.id = s."customerId"
        JOIN "User" u ON u.id = s."userId"
        LEFT JOIN "Employee" e ON e."userId" = u.id
        WHERE ${this.buildRawSaleWhere(businessId, query)}
      ),
      item_totals AS (
        SELECT
          si."saleId",
          COALESCE(SUM(si.quantity), 0)::bigint AS "quantitySold"
        FROM "SaleItem" si
        JOIN "Product" p ON p.id = si."productId"
        LEFT JOIN "Category" cat ON cat.id = p."categoryId"
        WHERE si."saleId" IN (SELECT id FROM sale_base)
          ${this.buildRawItemFilter(query)}
        GROUP BY si."saleId"
      )
      SELECT
        date_trunc(${period}, sb."saleDate" AT TIME ZONE ${timezone}) AS "periodStart",
        sb."employeeId",
        sb."employeeName",
        sb."employeeCode",
        sb."userId",
        COUNT(DISTINCT sb.id)::bigint AS "transactionCount",
        COALESCE(SUM(it."quantitySold"), 0)::bigint AS "quantitySold",
        COALESCE(SUM(sb."subtotal"), 0) AS "grossSales",
        COALESCE(SUM(sb."discountAmount"), 0) AS "discount",
        COALESCE(SUM(sb."taxAmount"), 0) AS "tax",
        COALESCE(SUM(sb."totalAmount"), 0) AS "netSales"
      FROM sale_base sb
      LEFT JOIN item_totals it ON it."saleId" = sb.id
      GROUP BY
        1,
        sb."employeeId",
        sb."employeeName",
        sb."employeeCode",
        sb."userId"
      ORDER BY "periodStart" ASC, "netSales" DESC
    `;

    return rows.map((row) => ({
      periodStart: row.periodStart,
      ...this.formatEmployeeSalesRow(row),
    }));
  }

  private async topSellingProducts(
    businessId: string,
    query: SalesReportQueryDto,
    limit: number,
  ) {
    const rows = await this.prisma.$queryRaw<TopSellingProductRow[]>`
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.sku AS "sku",
        COALESCE(SUM(si.quantity), 0)::bigint AS "quantitySold",
        COALESCE(SUM(si."totalAmount"), 0) AS "netSales"
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      LEFT JOIN "Customer" c ON c.id = s."customerId"
      JOIN "User" u ON u.id = s."userId"
      LEFT JOIN "Employee" e ON e."userId" = u.id
      WHERE ${this.buildRawSaleWhere(businessId, query)}
        ${this.buildRawItemFilter(query)}
      GROUP BY p.id, p.name, p.sku
      ORDER BY "quantitySold" DESC, "netSales" DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      quantitySold: this.toNumber(row.quantitySold),
      netSales: this.money(row.netSales),
    }));
  }

  private formatEmployeeSalesRow(row: EmployeeSalesRow) {
    const transactionCount = this.toNumber(row.transactionCount);
    const netSales = this.decimal(row.netSales);

    return {
      employeeId: row.employeeId,
      userId: row.userId,
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
      transactionCount,
      quantitySold: this.toNumber(row.quantitySold),
      grossSales: this.money(row.grossSales),
      discount: this.money(row.discount),
      tax: this.money(row.tax),
      netSales: this.money(netSales),
      averageTransactionValue: this.money(
        transactionCount > 0
          ? netSales.div(transactionCount)
          : new Prisma.Decimal(0),
      ),
    };
  }

  private async historicalCostOfGoodsSold(
    businessId: string,
    query: SalesReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<ProfitCogRow[]>`
      SELECT COALESCE(SUM(
        si.quantity * COALESCE(
          (
            SELECT it_sale."unitCost"
            FROM "InventoryTransaction" it_sale
            WHERE it_sale."businessId" = s."businessId"
              AND it_sale."productId" = si."productId"
              AND it_sale."transactionType" = ${InventoryTransactionType.SALE}::"InventoryTransactionType"
              AND it_sale."referenceNumber" = s."saleNumber"
              AND it_sale."unitCost" IS NOT NULL
              AND it_sale."unitCost" <> si."unitPrice"
            ORDER BY ABS(EXTRACT(EPOCH FROM (it_sale."transactionDate" - s."saleDate"))) ASC
            LIMIT 1
          ),
          (
            SELECT it_in."unitCost"
            FROM "InventoryTransaction" it_in
            WHERE it_in."businessId" = s."businessId"
              AND it_in."productId" = si."productId"
              AND it_in."unitCost" IS NOT NULL
              AND it_in."transactionDate" <= s."saleDate"
              AND it_in."transactionType" IN (
                ${InventoryTransactionType.PURCHASE}::"InventoryTransactionType",
                ${InventoryTransactionType.STOCK_IN}::"InventoryTransactionType",
                ${InventoryTransactionType.RETURN}::"InventoryTransactionType"
              )
            ORDER BY it_in."transactionDate" DESC
            LIMIT 1
          ),
          (
            SELECT gsi."unitCost"
            FROM "GoodsSuppliedItem" gsi
            JOIN "GoodsSupplied" gs ON gs.id = gsi."goodsSuppliedId"
            WHERE gs."businessId" = s."businessId"
              AND gsi."productId" = si."productId"
              AND gs."suppliedDate" <= s."saleDate"
            ORDER BY gs."suppliedDate" DESC
            LIMIT 1
          ),
          (
            SELECT poi."unitPrice"
            FROM "PurchaseOrderItem" poi
            JOIN "PurchaseOrder" po ON po.id = poi."purchaseOrderId"
            WHERE po."businessId" = s."businessId"
              AND poi."productId" = si."productId"
              AND po."status" = ${PurchaseOrderStatus.RECEIVED}::"PurchaseOrderStatus"
              AND po."orderDate" <= s."saleDate"
            ORDER BY po."orderDate" DESC
            LIMIT 1
          ),
          0
        )
      ), 0) AS "costOfGoodsSold"
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "Customer" c ON c.id = s."customerId"
      JOIN "User" u ON u.id = s."userId"
      LEFT JOIN "Employee" e ON e."userId" = u.id
      WHERE ${this.buildRawSaleWhere(businessId, query)}
        ${this.buildRawSaleItemExistsFilter(query, 'si')}
    `;

    return this.decimal(rows[0]?.costOfGoodsSold);
  }

  private buildExpenseWhere(
    businessId: string,
    query: ExpenseReportQueryDto,
  ): Prisma.ExpenseWhereInput {
    const search = query.search?.trim();
    this.assertValidAmountRange(query);

    return {
      businessId,
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.employeeId
        ? { user: { employee: { id: query.employeeId } } }
        : {}),
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

  private async expenseSummary(where: Prisma.ExpenseWhereInput) {
    const [totals, categoryGroups, paymentGroups] = await Promise.all([
      this.prisma.expense.aggregate({
        where,
        _count: { _all: true },
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
      categories.map((category) => [category.id, category.name]),
    );

    return {
      totalExpenses: this.money(totals._sum.amount),
      expenseCount: totals._count._all,
      expensesByCategory: categoryGroups.map((group) => ({
        categoryId: group.categoryId,
        categoryName: categoryById.get(group.categoryId) ?? 'Unknown',
        expenseCount: group._count._all,
        totalAmount: this.money(group._sum.amount),
      })),
      expensesByPaymentMethod: paymentGroups.map((group) => ({
        paymentMethod: group.paymentMethod,
        expenseCount: group._count._all,
        totalAmount: this.money(group._sum.amount),
      })),
    };
  }

  private async periodExpenseData(
    businessId: string,
    period: ReportPeriod,
    timezone: string,
    query: ExpenseReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<PeriodExpenseRow[]>`
      SELECT
        date_trunc(${period}, e."expenseDate" AT TIME ZONE ${timezone}) AS "periodStart",
        COUNT(*)::bigint AS "expenseCount",
        COALESCE(SUM(e.amount), 0) AS "totalAmount"
      FROM "Expense" e
      JOIN "ExpenseCategory" c ON c.id = e."categoryId"
      JOIN "User" u ON u.id = e."userId"
      LEFT JOIN "Employee" emp ON emp."userId" = u.id
      WHERE ${this.buildRawExpenseWhere(businessId, query)}
      GROUP BY 1
      ORDER BY "periodStart" ASC
    `;

    return rows.map((row) => ({
      periodStart: row.periodStart,
      expenseCount: this.toNumber(row.expenseCount),
      totalAmount: this.money(row.totalAmount),
    }));
  }

  private buildRawExpenseWhere(
    businessId: string,
    query: ExpenseReportQueryDto,
  ): Prisma.Sql {
    const search = query.search?.trim();
    const conditions: Prisma.Sql[] = [
      Prisma.sql`e."businessId" = ${businessId}::uuid`,
      Prisma.sql`e."deletedAt" IS NULL`,
    ];
    this.assertValidAmountRange(query);

    if (query.categoryId) {
      conditions.push(Prisma.sql`e."categoryId" = ${query.categoryId}::uuid`);
    }
    if (query.userId) {
      conditions.push(Prisma.sql`e."userId" = ${query.userId}::uuid`);
    }
    if (query.employeeId) {
      conditions.push(Prisma.sql`emp.id = ${query.employeeId}::uuid`);
    }
    if (query.paymentMethod) {
      conditions.push(
        Prisma.sql`e."paymentMethod" = ${query.paymentMethod}::"PaymentMethod"`,
      );
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

  private buildProductWhere(
    businessId: string,
    query: Pick<
      InventoryReportQueryDto,
      'productId' | 'categoryId' | 'supplierId' | 'search' | 'sku' | 'barcode'
    >,
  ): Prisma.ProductWhereInput {
    const search = query.search?.trim();

    return {
      businessId,
      ...(query.productId ? { id: query.productId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.supplierId
        ? { category: { supplierId: query.supplierId } }
        : {}),
      ...(query.sku
        ? {
            sku: {
              contains: query.sku.trim(),
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(query.barcode
        ? {
            barcode: {
              contains: query.barcode.trim(),
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                name: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
              { sku: { contains: search, mode: Prisma.QueryMode.insensitive } },
              {
                barcode: {
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
            ],
          }
        : {}),
    };
  }

  private buildInventoryWhere(
    businessId: string,
    query: InventoryReportQueryDto,
  ): Prisma.InventoryWhereInput {
    return {
      businessId,
      deletedAt: null,
      ...(query.productId ? { productId: query.productId } : {}),
      product: this.buildProductWhere(businessId, query),
    };
  }

  private buildInventoryMovementWhere(
    businessId: string,
    query: InventoryReportQueryDto,
  ): Prisma.InventoryTransactionWhereInput {
    const search = query.search?.trim();
    const productFilter = this.buildProductWhere(businessId, {
      ...query,
      search: undefined,
    });

    return {
      businessId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.transactionType
        ? { transactionType: query.transactionType }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            transactionDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      product: productFilter,
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
                remarks: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                product: {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                product: {
                  sku: {
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

  private async countLowStockProducts(
    businessId: string,
    query: InventoryReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Inventory" i
      JOIN "Product" p ON p.id = i."productId"
      LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      WHERE i."businessId" = ${businessId}::uuid
        AND i."deletedAt" IS NULL
        AND i."quantityAvailable" > 0
        AND i."quantityAvailable" <= COALESCE(i."reorderLevel", p."minimumStock", 0)
        ${this.buildRawInventoryProductFilter(query, 'p', 'cat')}
    `;

    return this.toNumber(rows[0]?.count);
  }

  private async countOutOfStockProducts(
    businessId: string,
    query: InventoryReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Inventory" i
      JOIN "Product" p ON p.id = i."productId"
      LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      WHERE i."businessId" = ${businessId}::uuid
        AND i."deletedAt" IS NULL
        AND i."quantityAvailable" <= 0
        ${this.buildRawInventoryProductFilter(query, 'p', 'cat')}
    `;

    return this.toNumber(rows[0]?.count);
  }

  private async currentInventoryValue(
    businessId: string,
    query: InventoryReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<InventoryValueRow[]>`
      SELECT COALESCE(SUM(
        i."quantityOnHand" * COALESCE(
          i."averageCost",
          (
            SELECT it."unitCost"
            FROM "InventoryTransaction" it
            WHERE it."businessId" = i."businessId"
              AND it."productId" = i."productId"
              AND it."unitCost" IS NOT NULL
              AND it."transactionType" IN (
                ${InventoryTransactionType.PURCHASE}::"InventoryTransactionType",
                ${InventoryTransactionType.STOCK_IN}::"InventoryTransactionType",
                ${InventoryTransactionType.RETURN}::"InventoryTransactionType"
              )
            ORDER BY it."transactionDate" DESC
            LIMIT 1
          ),
          p."purchasePrice",
          0
        )
      ), 0) AS "inventoryValue"
      FROM "Inventory" i
      JOIN "Product" p ON p.id = i."productId"
      LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      WHERE i."businessId" = ${businessId}::uuid
        AND i."deletedAt" IS NULL
        ${this.buildRawInventoryProductFilter(query, 'p', 'cat')}
    `;

    return this.decimal(rows[0]?.inventoryValue);
  }

  private async inventoryMovementTotals(
    businessId: string,
    query: InventoryReportQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<InventoryMovementAggregateRow[]>`
      SELECT
        COALESCE(SUM(CASE
          WHEN it."transactionType" IN (
            ${InventoryTransactionType.PURCHASE}::"InventoryTransactionType",
            ${InventoryTransactionType.STOCK_IN}::"InventoryTransactionType",
            ${InventoryTransactionType.RETURN}::"InventoryTransactionType"
          )
          THEN it.quantity ELSE 0 END), 0)::bigint AS "stockInQuantity",
        COALESCE(SUM(CASE
          WHEN it."transactionType" IN (
            ${InventoryTransactionType.SALE}::"InventoryTransactionType",
            ${InventoryTransactionType.STOCK_OUT}::"InventoryTransactionType",
            ${InventoryTransactionType.DAMAGE}::"InventoryTransactionType",
            ${InventoryTransactionType.EXPIRED}::"InventoryTransactionType"
          )
          THEN it.quantity ELSE 0 END), 0)::bigint AS "stockOutQuantity",
        COALESCE(SUM(CASE
          WHEN it."transactionType" = ${InventoryTransactionType.ADJUSTMENT}::"InventoryTransactionType"
          THEN it.quantity ELSE 0 END), 0)::bigint AS "adjustmentQuantity",
        COUNT(*) FILTER (
          WHERE it."transactionType" = ${InventoryTransactionType.ADJUSTMENT}::"InventoryTransactionType"
        )::bigint AS "adjustmentCount"
      FROM "InventoryTransaction" it
      JOIN "Product" p ON p.id = it."productId"
      LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      WHERE it."businessId" = ${businessId}::uuid
        ${this.buildRawInventoryMovementDateFilter(query)}
        ${this.buildRawInventoryProductFilter(query, 'p', 'cat')}
    `;

    return {
      stockInQuantity: rows[0]?.stockInQuantity ?? 0,
      stockOutQuantity: rows[0]?.stockOutQuantity ?? 0,
      adjustmentQuantity: rows[0]?.adjustmentQuantity ?? 0,
      adjustmentCount: rows[0]?.adjustmentCount ?? 0,
    };
  }

  private buildCreditWhere(
    businessId: string,
    query: CreditReportQueryDto,
  ): Prisma.CreditSaleWhereInput {
    const search = query.search?.trim();
    const now = new Date();

    return {
      sale: { businessId, deletedAt: null },
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
            ],
          }
        : {}),
    };
  }

  private buildCreditPaymentWhere(
    businessId: string,
    query: CreditReportQueryDto,
  ): Prisma.CreditPaymentWhereInput {
    const search = query.search?.trim();

    return {
      creditSale: {
        sale: { businessId, deletedAt: null },
        ...(query.status ? { status: query.status } : {}),
      },
      ...(query.customerId ? { customerId: query.customerId } : {}),
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

  private buildRawCreditWhere(
    businessId: string,
    query: CreditReportQueryDto,
    creditAlias: string,
    saleAlias: string,
    customerAlias: string,
  ) {
    const cs = Prisma.raw(`"${creditAlias}"`);
    const s = Prisma.raw(`"${saleAlias}"`);
    const c = Prisma.raw(`"${customerAlias}"`);
    const search = query.search?.trim();
    const conditions: Prisma.Sql[] = [
      Prisma.sql`${s}."businessId" = ${businessId}::uuid`,
      Prisma.sql`${s}."deletedAt" IS NULL`,
    ];

    if (query.customerId) {
      conditions.push(
        Prisma.sql`${cs}."customerId" = ${query.customerId}::uuid`,
      );
    }
    if (query.status) {
      conditions.push(
        Prisma.sql`${cs}."status" = ${query.status}::"CreditSaleStatus"`,
      );
    }
    if (query.overdue) {
      conditions.push(Prisma.sql`${cs}."balance" > 0`);
      conditions.push(Prisma.sql`${cs}."dueDate" < NOW()`);
      conditions.push(
        Prisma.sql`${cs}."status" <> ${CreditSaleStatus.PAID}::"CreditSaleStatus"`,
      );
    }
    if (query.startDate) {
      conditions.push(Prisma.sql`${cs}."createdAt" >= ${query.startDate}`);
    }
    if (query.endDate) {
      conditions.push(Prisma.sql`${cs}."createdAt" <= ${query.endDate}`);
    }
    if (query.dueFrom) {
      conditions.push(Prisma.sql`${cs}."dueDate" >= ${query.dueFrom}`);
    }
    if (query.dueTo) {
      conditions.push(Prisma.sql`${cs}."dueDate" <= ${query.dueTo}`);
    }
    if (search) {
      const like = `%${search}%`;
      conditions.push(Prisma.sql`(
        ${s}."saleNumber" ILIKE ${like}
        OR ${c}."firstName" ILIKE ${like}
        OR ${c}."lastName" ILIKE ${like}
        OR ${c}."companyName" ILIKE ${like}
        OR ${c}."phone" ILIKE ${like}
      )`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private buildSupplierWhere(
    businessId: string,
    query: SupplierReportQueryDto,
  ): Prisma.SupplierWhereInput {
    const search = query.search?.trim();

    return {
      businessId,
      deletedAt: null,
      ...(query.supplierId ? { id: query.supplierId } : {}),
      ...(query.supplierStatus ? { status: query.supplierStatus } : {}),
      ...(search
        ? {
            OR: [
              {
                supplierCode: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                companyName: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                contactPerson: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                phone: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
              {
                email: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
            ],
          }
        : {}),
    };
  }

  private buildPurchaseOrderWhere(
    businessId: string,
    query: SupplierReportQueryDto,
  ): Prisma.PurchaseOrderWhereInput {
    const search = query.search?.trim();
    const supplierFilter = this.buildSupplierWhere(businessId, {
      ...query,
      search: undefined,
    });

    return {
      businessId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.purchaseOrderStatus
        ? { status: query.purchaseOrderStatus }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            orderDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      supplier: supplierFilter,
      ...(search
        ? {
            OR: [
              {
                orderNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                supplier: {
                  companyName: {
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

  private buildGoodsSuppliedWhere(
    businessId: string,
    query: SupplierReportQueryDto,
  ): Prisma.GoodsSuppliedWhereInput {
    const search = query.search?.trim();
    const supplierFilter = this.buildSupplierWhere(businessId, {
      ...query,
      search: undefined,
    });

    return {
      businessId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.startDate || query.endDate
        ? {
            suppliedDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      supplier: supplierFilter,
      ...(search
        ? {
            OR: [
              {
                supplyNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                supplier: {
                  companyName: {
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

  private buildRawInventoryMovementDateFilter(
    query: Pick<InventoryReportQueryDto, 'startDate' | 'endDate'>,
  ) {
    const conditions: Prisma.Sql[] = [];

    if (query.startDate) {
      conditions.push(Prisma.sql`it."transactionDate" >= ${query.startDate}`);
    }
    if (query.endDate) {
      conditions.push(Prisma.sql`it."transactionDate" <= ${query.endDate}`);
    }

    if (conditions.length === 0) {
      return Prisma.empty;
    }

    return Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}`;
  }

  private buildRawInventoryProductFilter(
    query: Pick<
      InventoryReportQueryDto,
      'productId' | 'categoryId' | 'supplierId' | 'search' | 'sku' | 'barcode'
    >,
    productAlias: string,
    categoryAlias: string,
  ) {
    const product = Prisma.raw(`"${productAlias}"`);
    const category = Prisma.raw(`"${categoryAlias}"`);
    const search = query.search?.trim();
    const conditions: Prisma.Sql[] = [];

    if (query.productId) {
      conditions.push(Prisma.sql`${product}.id = ${query.productId}::uuid`);
    }
    if (query.categoryId) {
      conditions.push(
        Prisma.sql`${product}."categoryId" = ${query.categoryId}::uuid`,
      );
    }
    if (query.supplierId) {
      conditions.push(
        Prisma.sql`${category}."supplierId" = ${query.supplierId}::uuid`,
      );
    }
    if (query.sku?.trim()) {
      conditions.push(
        Prisma.sql`${product}.sku ILIKE ${`%${query.sku.trim()}%`}`,
      );
    }
    if (query.barcode?.trim()) {
      conditions.push(
        Prisma.sql`${product}.barcode ILIKE ${`%${query.barcode.trim()}%`}`,
      );
    }
    if (search) {
      const like = `%${search}%`;
      conditions.push(Prisma.sql`(
        ${product}.name ILIKE ${like}
        OR ${product}.sku ILIKE ${like}
        OR ${product}.barcode ILIKE ${like}
        OR ${category}.name ILIKE ${like}
      )`);
    }

    if (conditions.length === 0) {
      return Prisma.empty;
    }

    return Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}`;
  }

  private buildSaleWhere(
    businessId: string,
    query: SalesReportQueryDto,
  ): Prisma.SaleWhereInput {
    const productFilter = this.productSaleItemFilter(query);
    const search = query.search?.trim();
    const userFilter: Prisma.UserWhereInput = {
      ...(query.employeeId ? { employee: { id: query.employeeId } } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    return {
      businessId,
      deletedAt: null,
      status: SaleStatus.COMPLETED,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(Object.keys(userFilter).length ? { user: userFilter } : {}),
      ...(query.paymentMethod
        ? { payments: { some: { paymentMethod: query.paymentMethod } } }
        : {}),
      ...(productFilter ? { items: { some: productFilter } } : {}),
      ...(query.startDate || query.endDate
        ? {
            saleDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                saleNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                remarks: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
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
                items: {
                  some: {
                    product: {
                      OR: [
                        {
                          name: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                          },
                        },
                        {
                          sku: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                          },
                        },
                        {
                          barcode: {
                            contains: search,
                            mode: Prisma.QueryMode.insensitive,
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                payments: {
                  some: {
                    referenceNumber: {
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

  private buildSaleItemWhere(
    saleWhere: Prisma.SaleWhereInput,
    query: SalesReportQueryDto,
  ): Prisma.SaleItemWhereInput {
    return {
      sale: saleWhere,
      ...this.productSaleItemFilter(query),
    };
  }

  private buildPaymentWhere(
    businessId: string,
    query: PaymentReportQueryDto,
  ): Prisma.PaymentWhereInput {
    const productFilter = this.productSaleItemFilter(query);
    const search = query.search?.trim();

    return {
      businessId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.employeeId
        ? { user: { employee: { id: query.employeeId } } }
        : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.startDate || query.endDate
        ? {
            paymentDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      sale: {
        businessId,
        deletedAt: null,
        status: SaleStatus.COMPLETED,
        ...(query.branchId ? { user: { branchId: query.branchId } } : {}),
        ...(productFilter ? { items: { some: productFilter } } : {}),
      },
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
                sale: {
                  saleNumber: {
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
                sale: {
                  items: {
                    some: {
                      product: {
                        OR: [
                          {
                            name: {
                              contains: search,
                              mode: Prisma.QueryMode.insensitive,
                            },
                          },
                          {
                            sku: {
                              contains: search,
                              mode: Prisma.QueryMode.insensitive,
                            },
                          },
                          {
                            barcode: {
                              contains: search,
                              mode: Prisma.QueryMode.insensitive,
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private productSaleItemFilter(
    query: Pick<SalesReportQueryDto, 'categoryId' | 'productId' | 'supplierId'>,
  ): Prisma.SaleItemWhereInput | undefined {
    if (!query.productId && !query.categoryId && !query.supplierId) {
      return undefined;
    }

    return {
      product: {
        ...(query.productId ? { id: query.productId } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.supplierId
          ? { category: { supplierId: query.supplierId } }
          : {}),
      },
    };
  }

  private buildRawSaleWhere(
    businessId: string,
    query: SalesReportQueryDto,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`s."businessId" = ${businessId}::uuid`,
      Prisma.sql`s."deletedAt" IS NULL`,
      Prisma.sql`s."status" = ${SaleStatus.COMPLETED}::"SaleStatus"`,
    ];
    const search = query.search?.trim();

    if (query.customerId) {
      conditions.push(Prisma.sql`s."customerId" = ${query.customerId}::uuid`);
    }
    if (query.userId) {
      conditions.push(Prisma.sql`s."userId" = ${query.userId}::uuid`);
    }
    if (query.employeeId) {
      conditions.push(Prisma.sql`e.id = ${query.employeeId}::uuid`);
    }
    if (query.branchId) {
      conditions.push(Prisma.sql`u."branchId" = ${query.branchId}::uuid`);
    }
    if (query.paymentMethod) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "Payment" pm
          WHERE pm."saleId" = s.id
            AND pm."paymentMethod" = ${query.paymentMethod}::"PaymentMethod"
        )
      `);
    }
    if (query.startDate) {
      conditions.push(Prisma.sql`s."saleDate" >= ${query.startDate}`);
    }
    if (query.endDate) {
      conditions.push(Prisma.sql`s."saleDate" <= ${query.endDate}`);
    }
    if (query.productId || query.categoryId || query.supplierId) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "SaleItem" si_filter
          JOIN "Product" p_filter ON p_filter.id = si_filter."productId"
          LEFT JOIN "Category" cat_filter ON cat_filter.id = p_filter."categoryId"
          WHERE si_filter."saleId" = s.id
            ${this.buildRawProductFilter(query, 'p_filter', 'cat_filter')}
        )
      `);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(Prisma.sql`
        (
          s."saleNumber" ILIKE ${searchTerm}
          OR s."remarks" ILIKE ${searchTerm}
          OR c."firstName" ILIKE ${searchTerm}
          OR c."lastName" ILIKE ${searchTerm}
          OR c."companyName" ILIKE ${searchTerm}
          OR c."phone" ILIKE ${searchTerm}
          OR u."firstName" ILIKE ${searchTerm}
          OR u."lastName" ILIKE ${searchTerm}
          OR EXISTS (
            SELECT 1
            FROM "Payment" pm_search
            WHERE pm_search."saleId" = s.id
              AND pm_search."referenceNumber" ILIKE ${searchTerm}
          )
          OR EXISTS (
            SELECT 1
            FROM "SaleItem" si_search
            JOIN "Product" p_search ON p_search.id = si_search."productId"
            WHERE si_search."saleId" = s.id
              AND (
                p_search."name" ILIKE ${searchTerm}
                OR p_search."sku" ILIKE ${searchTerm}
                OR p_search."barcode" ILIKE ${searchTerm}
              )
          )
        )
      `);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private buildRawItemFilter(query: SalesReportQueryDto): Prisma.Sql {
    if (!query.productId && !query.categoryId && !query.supplierId) {
      return Prisma.empty;
    }

    return Prisma.sql`${this.buildRawProductFilter(query, 'p', 'cat')}`;
  }

  private buildRawProductFilter(
    query: Pick<SalesReportQueryDto, 'categoryId' | 'productId' | 'supplierId'>,
    productAlias: string,
    categoryAlias: string,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];

    if (query.productId) {
      conditions.push(
        Prisma.sql`${Prisma.raw(`"${productAlias}"`)}.id = ${query.productId}::uuid`,
      );
    }
    if (query.categoryId) {
      conditions.push(
        Prisma.sql`${Prisma.raw(`"${productAlias}"`)}."categoryId" = ${query.categoryId}::uuid`,
      );
    }
    if (query.supplierId) {
      conditions.push(
        Prisma.sql`${Prisma.raw(`"${categoryAlias}"`)}."supplierId" = ${query.supplierId}::uuid`,
      );
    }

    if (conditions.length === 0) {
      return Prisma.empty;
    }

    return Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}`;
  }

  private buildRawSaleItemExistsFilter(
    query: Pick<SalesReportQueryDto, 'categoryId' | 'productId' | 'supplierId'>,
    saleItemAlias: string,
  ): Prisma.Sql {
    if (!query.productId && !query.categoryId && !query.supplierId) {
      return Prisma.empty;
    }

    const saleItem = Prisma.raw(`"${saleItemAlias}"`);
    const conditions: Prisma.Sql[] = [];

    if (query.productId) {
      conditions.push(
        Prisma.sql`${saleItem}."productId" = ${query.productId}::uuid`,
      );
    }
    if (query.categoryId || query.supplierId) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "Product" p_cost
          LEFT JOIN "Category" cat_cost ON cat_cost.id = p_cost."categoryId"
          WHERE p_cost.id = ${saleItem}."productId"
            ${this.buildRawProductFilter(query, 'p_cost', 'cat_cost')}
        )
      `);
    }

    return Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}`;
  }

  private resolveDateRange(
    query: Pick<ReportFilterSource, 'startDate' | 'endDate' | 'datePreset'>,
    period: ReportPeriod,
    timezone: string,
  ): Pick<ReportFilterSource, 'startDate' | 'endDate'> {
    if (query.startDate || query.endDate) {
      if (query.startDate && query.endDate) {
        this.assertValidRange(query.startDate, query.endDate);
      }
      return {
        startDate: query.startDate,
        endDate: query.endDate,
      };
    }

    const preset: ReportDatePreset =
      query.datePreset ?? this.defaultPresetForPeriod(period);

    if (preset === 'custom') {
      throw new BadRequestException(
        'startDate and endDate are required when datePreset is custom',
      );
    }

    return this.resolvePresetRange(preset, timezone);
  }

  private defaultPresetForPeriod(period: ReportPeriod): ReportDatePreset {
    if (period === 'week') {
      return 'this_week';
    }
    if (period === 'month') {
      return 'this_month';
    }
    if (period === 'year') {
      return 'this_year';
    }
    return 'today';
  }

  private resolvePresetRange(
    preset: Exclude<ReportDatePreset, 'custom'>,
    timezone: string,
  ) {
    const today = this.localDateParts(new Date(), timezone);
    const todayStart = this.zonedTimeToUtc(
      today.year,
      today.month,
      today.day,
      0,
      0,
      0,
      0,
      timezone,
    );

    if (preset === 'today') {
      return this.closedRange(
        todayStart,
        this.addLocalDays(todayStart, 1, timezone),
      );
    }
    if (preset === 'yesterday') {
      const start = this.addLocalDays(todayStart, -1, timezone);
      return this.closedRange(start, todayStart);
    }

    const weekday = this.localWeekday(today.year, today.month, today.day);
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const thisWeekStart = this.addLocalDays(todayStart, mondayOffset, timezone);

    if (preset === 'this_week') {
      return this.closedRange(
        thisWeekStart,
        this.addLocalDays(thisWeekStart, 7, timezone),
      );
    }
    if (preset === 'last_week') {
      const start = this.addLocalDays(thisWeekStart, -7, timezone);
      return this.closedRange(start, thisWeekStart);
    }

    const thisMonthStart = this.zonedTimeToUtc(
      today.year,
      today.month,
      1,
      0,
      0,
      0,
      0,
      timezone,
    );

    if (preset === 'this_month') {
      return this.closedRange(
        thisMonthStart,
        this.addLocalMonths(thisMonthStart, 1, timezone),
      );
    }
    if (preset === 'last_month') {
      const start = this.addLocalMonths(thisMonthStart, -1, timezone);
      return this.closedRange(start, thisMonthStart);
    }

    const thisYearStart = this.zonedTimeToUtc(
      today.year,
      1,
      1,
      0,
      0,
      0,
      0,
      timezone,
    );

    if (preset === 'this_year') {
      return this.closedRange(
        thisYearStart,
        this.addLocalYears(thisYearStart, 1, timezone),
      );
    }

    const start = this.addLocalYears(thisYearStart, -1, timezone);
    return this.closedRange(start, thisYearStart);
  }

  private closedRange(startDate: Date, nextStartDate: Date) {
    return {
      startDate,
      endDate: new Date(nextStartDate.getTime() - 1),
    };
  }

  private addLocalDays(start: Date, days: number, timezone: string) {
    const parts = this.localDateParts(start, timezone);
    const shifted = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + days),
    );
    return this.zonedTimeToUtc(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
      0,
      0,
      0,
      0,
      timezone,
    );
  }

  private addLocalMonths(start: Date, months: number, timezone: string) {
    const parts = this.localDateParts(start, timezone);
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
    return this.zonedTimeToUtc(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0,
      timezone,
    );
  }

  private addLocalYears(start: Date, years: number, timezone: string) {
    const parts = this.localDateParts(start, timezone);
    return this.zonedTimeToUtc(parts.year + years, 1, 1, 0, 0, 0, 0, timezone);
  }

  private localWeekday(year: number, month: number, day: number) {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  private localDateParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const values = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );

    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
    };
  }

  private zonedTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    millisecond: number,
    timezone: string,
  ) {
    const desiredUtc = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      millisecond,
    );
    let utc = desiredUtc;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = this.localDateParts(new Date(utc), timezone);
      const actualUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        millisecond,
      );
      utc += desiredUtc - actualUtc;
    }

    return new Date(utc);
  }

  private async getBusinessTimezone(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const timezone = business?.timezone || 'UTC';

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      return timezone;
    } catch {
      return 'UTC';
    }
  }

  private assertValidRange(startDate: Date, endDate: Date) {
    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('startDate cannot be after endDate');
    }
  }

  private responseRange(query: ReportFilterSource) {
    return {
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
    };
  }

  private responseFilters(query: ReportFilterSource) {
    return {
      employeeId: query.employeeId ?? null,
      userId: query.userId ?? null,
      customerId: query.customerId ?? null,
      productId: query.productId ?? null,
      categoryId: query.categoryId ?? null,
      supplierId: query.supplierId ?? null,
      branchId: query.branchId ?? null,
      paymentMethod: query.paymentMethod ?? null,
      transactionType: query.transactionType ?? null,
      supplierStatus: query.supplierStatus ?? null,
      purchaseOrderStatus: query.purchaseOrderStatus ?? null,
      search: query.search?.trim() || null,
    };
  }

  private async auditReportAccess(
    businessId: string,
    userId: string,
    reportName: string,
    query: ReportFilterSource,
  ) {
    void query;
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        action: AuditAction.CREATE,
        entity: 'Report',
        entityId: null,
        description: `Generated ${reportName}`,
        deviceId: null,
        ipAddress: null,
      },
    });
  }

  private assertValidAmountRange(
    query: Pick<ExpenseReportQueryDto, 'minAmount' | 'maxAmount'>,
  ) {
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

  private decimal(
    value?: Prisma.Decimal | string | number | bigint | null,
  ): Prisma.Decimal {
    return new Prisma.Decimal(value?.toString() ?? 0);
  }

  private money(value?: Prisma.Decimal | string | number | bigint | null) {
    return this.decimal(value).toFixed(2);
  }

  private toNumber(value?: bigint | number | null) {
    return typeof value === 'bigint' ? Number(value) : (value ?? 0);
  }
}
