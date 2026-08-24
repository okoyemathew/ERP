import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { AddPurchaseOrderItemDto } from './dto/add-purchase-order-item.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { PurchaseOrderService } from './purchase-order.service';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@Controller('businesses/:businessId/suppliers/:supplierId/purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Post()
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Create purchase order' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.create(businessId, supplierId, dto, user);
  }

  @Get()
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'List purchase orders' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: PurchaseOrderQueryDto,
  ) {
    const queryWithSupplier = { ...query, supplierId };
    return this.purchaseOrderService.findAll(businessId, queryWithSupplier);
  }

  @Get('search')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'Search purchase orders' })
  search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query('q') q: string,
    @Query() query: PurchaseOrderQueryDto,
  ) {
    const queryWithSupplier = { ...query, supplierId };
    return this.purchaseOrderService.search(
      businessId,
      q ?? '',
      queryWithSupplier,
    );
  }

  @Get(':id')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'Get purchase order details' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchaseOrderService.findOne(businessId, id);
  }

  @Patch(':id')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Update draft purchase order' })
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.update(businessId, id, dto, user);
  }

  @Post(':id/items')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Add item to purchase order' })
  addItem(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) purchaseOrderId: string,
    @Body() dto: AddPurchaseOrderItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.addItem(
      businessId,
      purchaseOrderId,
      dto,
      user,
    );
  }

  @Delete(':id/items/:itemId')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Remove item from purchase order' })
  removeItem(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) purchaseOrderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.removeItem(
      businessId,
      purchaseOrderId,
      itemId,
      user,
    );
  }

  @Patch(':id/submit')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Submit draft purchase order' })
  submit(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.submit(businessId, id, user);
  }

  @Patch(':id/approve')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Approve pending purchase order' })
  approve(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.approve(businessId, id, user);
  }

  @Patch(':id/cancel')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Cancel purchase order' })
  cancel(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.cancel(businessId, id, user);
  }

  @Patch(':id/receive')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'Mark purchase order as received' })
  receive(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrderService.receive(businessId, id, dto, user);
  }
}
