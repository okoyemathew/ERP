import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreditReportQueryDto } from './dto/credit-report-query.dto';
import {
  ExpensePeriodReportQueryDto,
  ExpenseReportQueryDto,
} from './dto/expense-report-query.dto';
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto';
import { PaymentReportQueryDto } from './dto/payment-report-query.dto';
import {
  SalesPeriodReportQueryDto,
  SalesReportQueryDto,
} from './dto/sales-report-query.dto';
import { SupplierReportQueryDto } from './dto/supplier-report-query.dto';
import { ReportsService } from './reports.service';

const REPORT_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.SALESPERSON,
] as const;

@ApiTags('Reports')
@ApiBearerAuth()
@Permissions('reports.view')
@Roles(...REPORT_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'View general business report summary' })
  @ApiOkResponse({
    description:
      'Reporting summary for future dashboard use. This is not a Dashboard module.',
  })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getBusinessSummary(user.businessId, user, query);
  }

  @Get('sales')
  @ApiOperation({ summary: 'View sales report for a selected period' })
  @ApiOkResponse({
    description:
      'Sales report grouped by day, week, month, or year with PostgreSQL aggregation',
  })
  salesByPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesPeriodReportQueryDto,
  ) {
    return this.reportsService.getSalesPeriodReport(
      user.businessId,
      query.period ?? 'day',
      query,
      user,
    );
  }

  @Get('sales/daily')
  @ApiOperation({ summary: 'View daily sales report' })
  dailySales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getDailySalesReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('sales/weekly')
  @ApiOperation({ summary: 'View weekly sales report' })
  weeklySales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getWeeklySalesReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('sales/monthly')
  @ApiOperation({ summary: 'View monthly sales report' })
  monthlySales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getMonthlySalesReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('sales/yearly')
  @ApiOperation({ summary: 'View yearly sales report' })
  yearlySales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getYearlySalesReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('sales/custom')
  @ApiOperation({ summary: 'View custom date range sales report' })
  @ApiOkResponse({
    description:
      'Sales totals for an explicit custom date range using database aggregation',
  })
  customSales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getCustomSalesReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('payments')
  @ApiOperation({ summary: 'View payment method report' })
  @ApiOkResponse({
    description:
      'Sales payments grouped by payment method with transaction counts and total amount',
  })
  payments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentReportQueryDto,
  ) {
    return this.reportsService.getPaymentMethodReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('sales/payment-methods')
  @ApiOperation({ summary: 'View sales by payment method report' })
  @ApiOkResponse({
    description:
      'Alias for payment method reporting grouped by CASH, CARD, BANK_TRANSFER, MOBILE_MONEY, and CREDIT',
  })
  salesPaymentMethods(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentReportQueryDto,
  ) {
    return this.reportsService.getPaymentMethodReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('employees')
  @ApiOperation({ summary: 'View employee sales performance report' })
  @ApiOkResponse({
    description:
      'Employee sales report with transaction count, quantity sold, gross sales, discounts, tax, net sales, and average transaction value',
  })
  employees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesPeriodReportQueryDto,
  ) {
    return this.reportsService.getEmployeeSalesReport(
      user.businessId,
      query.period ?? 'day',
      query,
      user,
    );
  }

  @Get('employees/daily')
  @ApiOperation({ summary: 'View daily employee sales report' })
  dailyEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getEmployeeSalesReport(
      user.businessId,
      'day',
      query,
      user,
    );
  }

  @Get('employees/weekly')
  @ApiOperation({ summary: 'View weekly employee sales report' })
  weeklyEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getEmployeeSalesReport(
      user.businessId,
      'week',
      query,
      user,
    );
  }

  @Get('employees/monthly')
  @ApiOperation({ summary: 'View monthly employee sales report' })
  monthlyEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getEmployeeSalesReport(
      user.businessId,
      'month',
      query,
      user,
    );
  }

  @Get('employees/yearly')
  @ApiOperation({ summary: 'View yearly employee sales report' })
  yearlyEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getEmployeeSalesReport(
      user.businessId,
      'year',
      query,
      user,
    );
  }

  @Get('employees/custom')
  @ApiOperation({ summary: 'View custom date range employee sales report' })
  customEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getEmployeeSalesReport(
      user.businessId,
      'day',
      { ...query, datePreset: 'custom' },
      user,
    );
  }

  @Get('profit')
  @ApiOperation({ summary: 'View profit report' })
  @ApiOkResponse({
    description:
      'Profit report with gross revenue, historical COGS, gross profit, expenses, net profit, and margin',
  })
  profit(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.reportsService.getProfitReport(user.businessId, query, user);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'View expense report' })
  expenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpensePeriodReportQueryDto,
  ) {
    return this.reportsService.getExpenseReport(
      user.businessId,
      query.period ?? 'day',
      query,
      user,
    );
  }

  @Get('expenses/daily')
  @ApiOperation({ summary: 'View daily expense report' })
  dailyExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseReportQueryDto,
  ) {
    return this.reportsService.getExpenseReport(
      user.businessId,
      'day',
      query,
      user,
    );
  }

  @Get('expenses/monthly')
  @ApiOperation({ summary: 'View monthly expense report' })
  monthlyExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseReportQueryDto,
  ) {
    return this.reportsService.getExpenseReport(
      user.businessId,
      'month',
      query,
      user,
    );
  }

  @Get('expenses/yearly')
  @ApiOperation({ summary: 'View yearly expense report' })
  yearlyExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseReportQueryDto,
  ) {
    return this.reportsService.getExpenseReport(
      user.businessId,
      'year',
      query,
      user,
    );
  }

  @Get('expenses/custom')
  @ApiOperation({ summary: 'View custom date range expense report' })
  customExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseReportQueryDto,
  ) {
    return this.reportsService.getCustomExpenseReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('inventory')
  @ApiOperation({ summary: 'View inventory report' })
  inventory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.reportsService.getInventoryReport(user.businessId, query, user);
  }

  @Get('inventory/movements')
  @ApiOperation({ summary: 'View inventory movement history report' })
  inventoryMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InventoryReportQueryDto,
  ) {
    return this.reportsService.getInventoryMovementHistory(
      user.businessId,
      query,
      user,
    );
  }

  @Get('credits')
  @ApiOperation({ summary: 'View credit report' })
  credits(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditReportQueryDto,
  ) {
    return this.reportsService.getCreditReport(user.businessId, query, user);
  }

  @Get('credit')
  @ApiOperation({ summary: 'View credit report' })
  creditAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditReportQueryDto,
  ) {
    return this.reportsService.getCreditReport(user.businessId, query, user);
  }

  @Get('credits/by-customer')
  @ApiOperation({ summary: 'View credit totals by customer' })
  creditByCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditReportQueryDto,
  ) {
    return this.reportsService.getCreditByCustomerReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('credits/payments')
  @ApiOperation({ summary: 'View credit payment history report' })
  creditPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditReportQueryDto,
  ) {
    return this.reportsService.getCreditPaymentHistoryReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'View supplier report' })
  suppliers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupplierReportQueryDto,
  ) {
    return this.reportsService.getSupplierReport(user.businessId, query, user);
  }

  @Get('suppliers/purchases')
  @ApiOperation({ summary: 'View supplier purchase history report' })
  supplierPurchases(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupplierReportQueryDto,
  ) {
    return this.reportsService.getSupplierPurchaseHistoryReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('suppliers/payments')
  @ApiOperation({ summary: 'View supplier payment history report' })
  supplierPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupplierReportQueryDto,
  ) {
    return this.reportsService.getSupplierPaymentHistoryReport(
      user.businessId,
      query,
      user,
    );
  }
}
