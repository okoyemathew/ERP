import { saleCollections, collectionsBySale } from '../sales/sale-collections';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const [expensesToday, creditBalance] = await Promise.all([
      this.prisma.expense.aggregate({
        where: {
          businessId,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditSale.aggregate({
        where: { sale: { businessId } },
        _sum: { balance: true },
      }),
    ]);

    const [
      customerCount,
      supplierCount,
      productCount,
      lowStockCount,
      branchCount,
      userCount,
    ] = await Promise.all([
      this.prisma.customer.count({
        where: { businessId, status: 'ACTIVE' },
      }),
      this.prisma.supplier.count({
        where: { businessId, status: 'ACTIVE' },
      }),
      this.prisma.inventory.count({
        where: { businessId, quantityAvailable: { gt: 0 } },
      }),
      this.prisma.inventory.count({
        where: {
          businessId,
          quantityAvailable: { lt: 0 },
        },
      }),
      this.prisma.branch.count({ where: { businessId, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { businessId, status: 'ACTIVE' } }),
    ]);

    const collections = await saleCollections(
      this.prisma,
      { businessId },
      {
        startDate: new Date(new Date().setHours(0, 0, 0, 0)),
        endDate: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    );
    const collectedTotal = collections.reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );
    const receipts = await saleCollections(this.prisma, { businessId }, {
      startDate: new Date(new Date().setHours(0, 0, 0, 0)),
      endDate: new Date(new Date().setHours(23, 59, 59, 999)),
    }, undefined, 'received');
    return {
      totalSalesToday: collectionsBySale(collections).size,
      totalRevenueToday: collectedTotal,
      totalPaymentsToday: receipts.reduce((sum, row) => sum + Number(row.amount), 0),
      totalExpensesToday: Number(expensesToday._sum.amount ?? 0),
      outstandingCreditBalance: Number(creditBalance._sum?.balance ?? 0),
      activeCustomersCount: customerCount,
      activeSuppliersCount: supplierCount,
      availableProductsCount: productCount,
      lowStockProductsCount: lowStockCount,
      branchesCount: branchCount,
      activeUsersCount: userCount,
    };
  }

  async getStatistics(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const expenses = await this.prisma.expense.groupBy({
      by: ['createdAt'],
      where: { businessId, createdAt: { gte: startDate } },
      _sum: { amount: true },
    });

    const dailyRange = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      return date;
    });

    const formatDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const expensesMap = new Map(
      expenses.map((item) => [formatDate(new Date(item.createdAt)), item]),
    );

    const collections = await saleCollections(
      this.prisma,
      { businessId },
      { startDate, endDate: new Date(new Date().setHours(23, 59, 59, 999)) },
    );
    const salesLast7Days = dailyRange.map((date) => {
      const key = formatDate(date);
      const rows = collections.filter(
        (row) => formatDate(row.paymentDate) === key,
      );
      return {
        date: key,
        revenue: rows.reduce((sum, row) => sum + Number(row.amount), 0),
        salesCount: collectionsBySale(rows).size,
      };
    });

    const receipts = await saleCollections(this.prisma, { businessId },
      { startDate, endDate: new Date(new Date().setHours(23, 59, 59, 999)) }, undefined, 'received');
    const paymentsLast7Days = dailyRange.map((date) => {
      const key = formatDate(date);
      const rows = receipts.filter(
        (row) => formatDate(row.paymentDate) === key,
      );
      return {
        date: key,
        amount: rows.reduce((sum, row) => sum + Number(row.amount), 0),
      };
    });

    const expensesLast7Days = dailyRange.map((date) => {
      const key = formatDate(date);
      const item = expensesMap.get(key);
      return {
        date: key,
        amount: Number(item?._sum.amount ?? 0),
      };
    });

    const totalRevenue = salesLast7Days.reduce(
      (sum, record) => sum + record.revenue,
      0,
    );
    const averageDailyRevenue = totalRevenue / 7;

    const creditSales = await this.prisma.creditSale.aggregate({
      where: { sale: { businessId } },
      _sum: { balance: true },
    });

    return {
      salesLast7Days,
      paymentsLast7Days,
      expensesLast7Days,
      averageDailyRevenue,
      creditSalesBalance: Number(creditSales._sum?.balance ?? 0),
    };
  }
}
