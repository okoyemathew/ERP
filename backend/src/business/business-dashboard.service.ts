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

    const [salesToday, paymentsToday, expensesToday, creditBalance] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: {
            businessId,
            status: 'COMPLETED',
            saleDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          _count: true,
          _sum: { totalAmount: true },
        }),
        this.prisma.payment.aggregate({
          where: {
            businessId,
            paymentDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          _sum: { amount: true },
        }),
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

    return {
      totalSalesToday: salesToday._count ?? 0,
      totalRevenueToday: Number(salesToday._sum.totalAmount ?? 0),
      totalPaymentsToday: Number(paymentsToday._sum.amount ?? 0),
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

    const sales = await this.prisma.sale.groupBy({
      by: ['saleDate'],
      where: {
        businessId,
        saleDate: { gte: startDate },
        status: 'COMPLETED',
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const payments = await this.prisma.payment.groupBy({
      by: ['paymentDate'],
      where: { businessId, paymentDate: { gte: startDate } },
      _sum: { amount: true },
    });

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

    const formatDate = (date: Date) => date.toISOString().slice(0, 10);

    const salesMap = new Map(
      sales.map((item) => [formatDate(new Date(item.saleDate)), item]),
    );
    const paymentsMap = new Map(
      payments.map((item) => [formatDate(new Date(item.paymentDate)), item]),
    );
    const expensesMap = new Map(
      expenses.map((item) => [formatDate(new Date(item.createdAt)), item]),
    );

    const salesLast7Days = dailyRange.map((date) => {
      const key = formatDate(date);
      const item = salesMap.get(key);
      return {
        date: key,
        revenue: Number(item?._sum.totalAmount ?? 0),
        salesCount: item?._count.id ?? 0,
      };
    });

    const paymentsLast7Days = dailyRange.map((date) => {
      const key = formatDate(date);
      const item = paymentsMap.get(key);
      return {
        date: key,
        amount: Number(item?._sum.amount ?? 0),
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
