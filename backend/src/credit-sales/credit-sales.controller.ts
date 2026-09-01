import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreditSalesService } from './credit-sales.service';
import { CreditSaleActionDecisionDto } from './dto/credit-sale-action-decision.dto';
import { CreditSaleActionRequestDto } from './dto/credit-sale-action-request.dto';
import { CreateCreditPaymentDto } from './dto/create-credit-payment.dto';
import { CreateCreditSaleDto } from './dto/create-credit-sale.dto';
import { CreditPaymentQueryDto } from './dto/credit-payment-query.dto';
import { CreditSaleQueryDto } from './dto/credit-sale-query.dto';
import { UpdateEmployeeCreditSaleDto } from './dto/update-employee-credit-sale.dto';

const CREDIT_SALE_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.SALESPERSON,
] as const;

const FINANCIAL_CREDIT_REPORT_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
] as const;

@ApiTags('Credit Sales')
@ApiBearerAuth()
@Permissions('credit-sales.manage')
@Roles(...CREDIT_SALE_ROLES)
@Controller('credit-sales')
export class CreditSalesController {
  constructor(private readonly creditSalesService: CreditSalesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create credit sale' })
  @ApiCreatedResponse({
    description:
      'Credit sale created with linked Sale, SaleItems, Payments, CreditSale, inventory movements, customer balance update, and audit log',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCreditSaleDto,
  ) {
    return this.creditSalesService.create(user.businessId, dto, user);
  }

  @Get()
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'List credit sales' })
  @ApiOkResponse({
    description:
      'Paginated credit sales with report totals, customer, sale, due date, outstanding balance, and status details',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditSaleQueryDto,
  ) {
    return this.creditSalesService.findAll(user.businessId, query);
  }

  @Get('search')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'Search credit sales' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q: string,
    @Query() query: CreditSaleQueryDto,
  ) {
    return this.creditSalesService.search(user.businessId, q ?? '', query);
  }

  @Get('outstanding-balance')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View business outstanding credit balance' })
  outstandingBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.creditSalesService.getBusinessOutstandingBalance(
      user.businessId,
    );
  }

  @Get('outstanding')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View outstanding credit sales report' })
  @ApiOkResponse({
    description:
      'Outstanding credit report with totals, distinct account counts, filtering, pagination, sorting, and search',
  })
  outstanding(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditSaleQueryDto,
  ) {
    return this.creditSalesService.getOutstandingReport(user.businessId, query);
  }

  @Get('pos/outstanding')
  @Permissions('sales.manage')
  @Roles(...CREDIT_SALE_ROLES)
  @ApiOperation({ summary: 'View outstanding credit sales for POS collection' })
  posOutstanding(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditSaleQueryDto,
  ) {
    return this.creditSalesService.getOutstandingReport(
      user.businessId,
      query,
      user,
    );
  }

  @Get('action-requests')
  @Roles(SYSTEM_ROLES.OWNER)
  @ApiOperation({ summary: 'List pending employee credit sale action requests' })
  actionRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.creditSalesService.listPendingEmployeeActionRequests(
      user.businessId,
      user,
    );
  }

  @Post('action-requests/:requestId/approve')
  @Roles(SYSTEM_ROLES.OWNER)
  @ApiOperation({ summary: 'Approve an employee credit sale edit/delete request' })
  approveActionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CreditSaleActionDecisionDto,
  ) {
    return this.creditSalesService.approveEmployeeActionRequest(
      user.businessId,
      requestId,
      dto.note,
      user,
    );
  }

  @Post('action-requests/:requestId/reject')
  @Roles(SYSTEM_ROLES.OWNER)
  @ApiOperation({ summary: 'Reject an employee credit sale edit/delete request' })
  rejectActionRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CreditSaleActionDecisionDto,
  ) {
    return this.creditSalesService.rejectEmployeeActionRequest(
      user.businessId,
      requestId,
      dto.note,
      user,
    );
  }

  @Get('overdue')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View overdue credit sales report' })
  @ApiOkResponse({
    description:
      'Overdue credit report with totals, distinct account counts, filtering, pagination, sorting, and search',
  })
  overdue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditSaleQueryDto,
  ) {
    return this.creditSalesService.getOverdueReport(user.businessId, query);
  }

  @Get('customers/:customerId')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View customer credit' })
  customerCredit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: CreditSaleQueryDto,
  ) {
    return this.creditSalesService.getCustomerCredit(
      user.businessId,
      customerId,
      query,
    );
  }

  @Get('customer/:customerId')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View customer credit' })
  customerCreditAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: CreditSaleQueryDto,
  ) {
    return this.creditSalesService.getCustomerCredit(
      user.businessId,
      customerId,
      query,
    );
  }

  @Get('customers/:customerId/outstanding-balance')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View customer outstanding credit balance' })
  customerOutstandingBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.creditSalesService.getCustomerOutstandingBalance(
      user.businessId,
      customerId,
    );
  }

  @Get('customers/:customerId/payments')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View customer credit payment history' })
  customerPaymentHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: CreditPaymentQueryDto,
  ) {
    return this.creditSalesService.getCustomerPaymentHistory(
      user.businessId,
      customerId,
      query,
    );
  }

  @Get('customers/:customerId/statement')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View customer credit statement' })
  customerStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: CreditPaymentQueryDto,
  ) {
    return this.creditSalesService.getCustomerStatement(
      user.businessId,
      customerId,
      query,
    );
  }

  @Get('customer/:customerId/statement')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View customer credit statement' })
  customerStatementAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: CreditPaymentQueryDto,
  ) {
    return this.creditSalesService.getCustomerStatement(
      user.businessId,
      customerId,
      query,
    );
  }

  @Post(':id/action-requests')
  @Permissions('sales.manage')
  @Roles(...CREDIT_SALE_ROLES)
  @ApiOperation({ summary: 'Request owner approval before employee credit sale edit/delete' })
  requestAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreditSaleActionRequestDto,
  ) {
    return this.creditSalesService.requestEmployeeAction(
      user.businessId,
      id,
      dto.action,
      dto.reason,
      user,
    );
  }

  @Patch(':id/employee-edit')
  @Permissions('sales.manage')
  @Roles(...CREDIT_SALE_ROLES)
  @ApiOperation({ summary: 'Edit employee credit sale after owner approval' })
  updateEmployeeCreditSale(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeCreditSaleDto,
  ) {
    return this.creditSalesService.updateEmployeeCreditSale(
      user.businessId,
      id,
      dto,
      user,
    );
  }

  @Delete(':id/employee-delete')
  @Permissions('sales.manage')
  @Roles(...CREDIT_SALE_ROLES)
  @ApiOperation({ summary: 'Remove employee credit sale after owner approval' })
  removeEmployeeCreditSale(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditSalesService.removeEmployeeCreditSale(
      user.businessId,
      id,
      user,
    );
  }

  @Get(':id')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View credit sale' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditSalesService.findOne(user.businessId, id);
  }

  @Get(':id/due-date')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View credit sale due date' })
  dueDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditSalesService.getDueDate(user.businessId, id);
  }

  @Get(':id/status')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View credit sale status' })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditSalesService.getStatus(user.businessId, id);
  }

  @Get(':id/balance')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'Calculate remaining credit sale balance' })
  balance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditSalesService.getRemainingBalance(user.businessId, id);
  }

  @Get(':id/payments')
  @Roles(...FINANCIAL_CREDIT_REPORT_ROLES)
  @ApiOperation({ summary: 'View credit sale payment history' })
  paymentHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CreditPaymentQueryDto,
  ) {
    return this.creditSalesService.getPaymentHistory(
      user.businessId,
      id,
      query,
    );
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Collect credit payment' })
  collectPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditPaymentDto,
  ) {
    return this.creditSalesService.collectPayment(
      user.businessId,
      id,
      dto,
      user,
    );
  }

  @Post(':id/pos-payments')
  @Permissions('sales.manage')
  @Roles(...CREDIT_SALE_ROLES)
  @ApiOperation({ summary: 'Collect credit payment from POS' })
  collectPosPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditPaymentDto,
  ) {
    return this.creditSalesService.collectPayment(
      user.businessId,
      id,
      dto,
      user,
    );
  }
}
