import {
  Body,
  Controller,
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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

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
@Permissions('customers.manage')
@Controller('customers')
export class CustomerApiController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'List customers' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customerService.findAll(user.businessId, query);
  }

  @Post()
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
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customerService.create(user.businessId, dto, user);
  }

  @Get('search')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'Search customers' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customerService.search(user.businessId, q ?? '', query);
  }

  @Get(':id')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'View customer' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerService.findOne(user.businessId, id);
  }

  @Patch(':id')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Update customer' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(user.businessId, id, dto, user);
  }

  @Get(':id/sales')
  @Roles(...CUSTOMER_READ_ROLES)
  @ApiOperation({ summary: 'View customer sales history' })
  sales(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customerService.getSalesHistory(user.businessId, id, query);
  }

  @Get(':id/payments')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.CASHIER,
    SYSTEM_ROLES.SALESPERSON,
  )
  @ApiOperation({ summary: 'View customer payment history' })
  payments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customerService.getPaymentHistory(user.businessId, id, query);
  }

  @Get(':id/credit')
  @Permissions('credit-sales.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'View customer credit history' })
  credit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customerService.getCreditHistory(user.businessId, id, query);
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customerService.getStatement(user.businessId, id, query);
  }
}
