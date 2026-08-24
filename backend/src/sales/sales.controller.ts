import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CompleteSaleDto } from './dto/complete-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { AddSaleItemDto } from './dto/sale-item.dto';
import { UpdateSaleCustomerDto } from './dto/update-sale-customer.dto';
import { SalesService } from './sales.service';

const SALES_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.SALESPERSON,
] as const;

@ApiTags('Sales')
@ApiBearerAuth()
@Permissions('sales.manage')
@Roles(...SALES_ROLES)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a pending sale, optionally with initial items',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user.businessId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List sales history' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SaleQueryDto,
  ) {
    return this.salesService.findAll(user.businessId, query);
  }

  @Get('products/lookup')
  @ApiOperation({
    summary: 'Lookup sellable product by productId, barcode, or SKU',
  })
  lookupProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Query('productId') productId?: string,
    @Query('barcode') barcode?: string,
    @Query('sku') sku?: string,
  ) {
    return this.salesService.lookupProduct(user.businessId, {
      productId,
      barcode,
      sku,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'View sale details' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.findOne(user.businessId, id);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get receipt for a completed sale' })
  @ApiOkResponse({
    description:
      'Immutable receipt data generated automatically when the sale was completed',
  })
  receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.getSaleReceipt(user.businessId, id);
  }

  @Patch(':id/customer')
  @ApiOperation({ summary: 'Select or clear customer on a pending sale' })
  selectCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleCustomerDto,
  ) {
    return this.salesService.selectCustomer(user.businessId, id, dto, user);
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate a pending sale cart' })
  validateCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.validateCart(user.businessId, id);
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add product to a pending sale' })
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSaleItemDto,
  ) {
    return this.salesService.addItem(user.businessId, id, dto, user);
  }

  @Patch(':id/items/:saleItemId/remove')
  @ApiOperation({ summary: 'Remove product from a pending sale' })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('saleItemId', ParseUUIDPipe) saleItemId: string,
  ) {
    return this.salesService.removeItem(user.businessId, id, saleItemId, user);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete sale and reduce inventory atomically' })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteSaleDto,
  ) {
    return this.salesService.complete(user.businessId, id, dto, user);
  }

  @Patch(':id/cancel')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Cancel a pending sale' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.cancelPending(user.businessId, id, user);
  }
}
