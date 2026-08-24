import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryHistoryQueryDto } from './dto/inventory-history-query.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { StockAdjustmentQueryDto } from './dto/stock-adjustment-query.dto';
import { StockMutationDto } from './dto/stock-mutation.dto';
import { StockAdjustmentRequestDto } from './dto/stock-adjustment-request.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('businesses/:businessId/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({ summary: 'List inventory for a business' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: InventoryQueryDto,
  ) {
    return this.inventoryService.findAll(businessId, query);
  }

  @Get('search/sku')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({ summary: 'Search inventory by SKU' })
  searchBySku(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query('sku') sku: string,
  ) {
    return this.inventoryService.searchBySku(businessId, sku);
  }

  @Get('search/barcode')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({ summary: 'Search inventory by barcode' })
  searchByBarcode(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query('barcode') barcode: string,
  ) {
    return this.inventoryService.searchByBarcode(businessId, barcode);
  }

  @Get('search')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({
    summary: 'Search inventory by SKU, barcode, or product name',
  })
  searchInventory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query('q') q?: string,
  ) {
    return this.inventoryService.searchInventory(businessId, q ?? '');
  }

  @Get('adjustments')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'View stock adjustments' })
  getAdjustments(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query('productId', ParseUUIDPipe) productId: string,
    @Query() query: StockAdjustmentQueryDto,
  ) {
    return this.inventoryService.getAdjustments(businessId, productId, query);
  }

  @Get('low-stock')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({ summary: 'Detect low stock items' })
  getLowStockProducts(@Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.inventoryService.getLowStockProducts(businessId);
  }

  @Get('out-of-stock')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({ summary: 'Detect out-of-stock items' })
  getOutOfStockProducts(
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.inventoryService.getOutOfStockProducts(businessId);
  }

  @Get(':productId')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({ summary: 'View inventory by product' })
  findByProduct(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventoryService.findByProduct(businessId, productId);
  }

  @Get(':productId/history')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.SALESPERSON,
    SYSTEM_ROLES.CASHIER,
  )
  @ApiOperation({ summary: 'View product inventory history' })
  getHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: InventoryHistoryQueryDto,
  ) {
    return this.inventoryService.getHistory(businessId, productId, query);
  }

  @Post('stock-in')
  @Permissions('inventory.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Stock in inventory' })
  stockIn(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: StockMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.stockIn(businessId, dto, user);
  }

  @Post('stock-out')
  @Permissions('inventory.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Stock out inventory' })
  stockOut(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: StockMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.stockOut(businessId, dto, user);
  }

  @Post('adjust')
  @Permissions('inventory.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adjust stock through inventory service' })
  adjustStock(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: AdjustInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.adjustStock(
      businessId,
      dto.productId,
      dto,
      user,
    );
  }

  @Post('adjustment')
  @Permissions('inventory.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock adjustment entry' })
  createAdjustment(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: StockAdjustmentRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.stockAdjustment(businessId, dto, user);
  }

  @Post('damage')
  @Permissions('inventory.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record damaged stock' })
  createDamage(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: StockMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createDamage(businessId, dto, user);
  }

  @Post('expired')
  @Permissions('inventory.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record expired stock' })
  createExpiredStock(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: StockMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createExpiredStock(businessId, dto, user);
  }

  @Post('return')
  @Permissions('inventory.manage')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record stock return' })
  stockReturn(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: StockMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.stockReturn(businessId, dto, user);
  }
}
