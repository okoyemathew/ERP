import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CustomerService } from './customer.service';
import { CollectCreditPaymentDto } from './dto/collect-credit-payment.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ValidateCreditLimitDto } from './dto/validate-credit-limit.dto';

const CUSTOMER_READ_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.SALESPERSON,
  SYSTEM_ROLES.SUPERVISOR,
] as const;

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('businesses/:businessId/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  private assertBusinessAccess(
    businessId: string,
    user: AuthenticatedUser,
  ): void {
    if (user.businessId !== businessId) {
      throw new ForbiddenException('Cannot access customers for this business');
    }
  }

  @Post()
  @Permissions('customers.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.CASHIER,
    SYSTEM_ROLES.SALESPERSON,
  )
  @ApiOperation({ summary: 'Create customer' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.create(businessId, dto, user);
  }

  @Get()
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'List customers' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.findAll(businessId, query);
  }

  @Get('search')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'Search customers' })
  search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query('q') q: string,
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.search(businessId, q ?? '', query);
  }

  @Get(':id')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'View customer' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.findOne(businessId, id);
  }

  @Get(':id/profile')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'View customer profile' })
  profile(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getProfile(businessId, id);
  }

  @Get(':id/outstanding-balance')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.CASHIER,
    SYSTEM_ROLES.SALESPERSON,
  )
  @ApiOperation({ summary: 'View customer outstanding balance' })
  outstandingBalance(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getOutstandingBalance(businessId, id);
  }

  @Get(':id/outstanding-credit-balance')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.CASHIER,
    SYSTEM_ROLES.SALESPERSON,
  )
  @ApiOperation({ summary: 'View customer outstanding credit balance' })
  outstandingCreditBalance(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getOutstandingCreditBalance(businessId, id);
  }

  @Get(':id/purchase-history')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'View customer purchase history' })
  purchaseHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getPurchaseHistory(businessId, id, query);
  }

  @Get(':id/sales-history')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'View customer sales history' })
  salesHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getSalesHistory(businessId, id, query);
  }

  @Get(':id/payment-history')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.CASHIER,
    SYSTEM_ROLES.SALESPERSON,
  )
  @ApiOperation({ summary: 'View customer payment history' })
  paymentHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getPaymentHistory(businessId, id, query);
  }

  @Get(':id/credit-history')
  @Permissions('credit-sales.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'View customer credit history' })
  creditHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getCreditHistory(businessId, id, query);
  }

  @Get(':id/statement')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'View customer statement' })
  statement(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.getStatement(businessId, id, query);
  }

  @Post(':id/credit-payments')
  @Permissions('credit-sales.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Collect customer credit payment' })
  collectCreditPayment(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CollectCreditPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.collectCreditPayment(businessId, id, dto, user);
  }

  @Post(':id/validate-credit-limit')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.CASHIER,
    SYSTEM_ROLES.SALESPERSON,
  )
  @ApiOperation({ summary: 'Validate customer credit limit' })
  validateCreditLimit(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateCreditLimitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.validateCreditLimit(
      businessId,
      id,
      dto.amount,
      user,
    );
  }

  @Patch(':id')
  @Permissions('customers.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Update customer' })
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.update(businessId, id, dto, user);
  }

  @Patch(':id/activate')
  @Permissions('customers.manage')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Activate customer' })
  activate(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.activate(businessId, id, user);
  }

  @Patch(':id/deactivate')
  @Permissions('customers.manage')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Deactivate customer' })
  deactivate(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.customerService.deactivate(businessId, id, user);
  }
}
