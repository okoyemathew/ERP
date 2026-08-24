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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { SupplierService } from './supplier.service';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('businesses/:businessId/suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  private assertBusinessAccess(
    businessId: string,
    user: AuthenticatedUser,
  ): void {
    if (user.businessId !== businessId) {
      throw new ForbiddenException('Cannot access suppliers for this business');
    }
  }

  @Post()
  @Permissions('suppliers.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Create supplier' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.create(businessId, dto, user);
  }

  @Get()
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'List suppliers' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: SupplierQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.findAll(businessId, query);
  }

  @Get('search')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'Search suppliers' })
  search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query('q') q: string,
    @Query() query: SupplierQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.search(businessId, q ?? '', query);
  }

  @Get(':id')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'View supplier' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.findOne(businessId, id);
  }

  @Patch(':id')
  @Permissions('suppliers.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Update supplier' })
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.update(businessId, id, dto, user);
  }

  @Patch(':id/activate')
  @Permissions('suppliers.manage')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Activate supplier' })
  activate(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.activate(businessId, id, user);
  }

  @Patch(':id/deactivate')
  @Permissions('suppliers.manage')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Deactivate supplier' })
  deactivate(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.deactivate(businessId, id, user);
  }

  @Get(':id/outstanding-balance')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get supplier outstanding balance' })
  getOutstandingBalance(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.getOutstandingBalance(businessId, id);
  }

  @Post(':id/payments')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.ACCOUNTANT)
  @ApiOperation({ summary: 'Record supplier payment' })
  recordPayment(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { amount: number; reference: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.recordSupplierPayment(
      businessId,
      id,
      dto.amount,
      dto.reference,
      user,
    );
  }

  @Get(':id/payment-history')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.ACCOUNTANT)
  @ApiOperation({ summary: 'Get supplier payment history' })
  getPaymentHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.supplierService.getPaymentHistory(businessId, id);
  }
}
