import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateGoodsSuppliedDto } from './dto/create-goods-supplied.dto';
import { GoodsSuppliedQueryDto } from './dto/goods-supplied-query.dto';
import { GoodsSuppliedService } from './goods-supplied.service';

@ApiTags('Goods Supplied')
@ApiBearerAuth()
@Controller('businesses/:businessId/suppliers/:supplierId/goods-supplied')
export class GoodsSuppliedController {
  constructor(private readonly goodsSuppliedService: GoodsSuppliedService) {}

  @Post()
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
  )
  @ApiOperation({ summary: 'Receive goods from supplier' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateGoodsSuppliedDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.goodsSuppliedService.create(businessId, supplierId, dto, user);
  }

  @Get()
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'List goods supplied from supplier' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: GoodsSuppliedQueryDto,
  ) {
    const queryWithSupplier = { ...query, supplierId };
    return this.goodsSuppliedService.findAll(businessId, queryWithSupplier);
  }

  @Get('search')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Search goods supplied' })
  search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query('q') q: string,
    @Query() query: GoodsSuppliedQueryDto,
  ) {
    const queryWithSupplier = { ...query, supplierId };
    return this.goodsSuppliedService.search(
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
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get goods supplied details' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.goodsSuppliedService.findOne(businessId, id);
  }

  @Get('history/purchase')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.INVENTORY_OFFICER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get supplier purchase history' })
  getPurchaseHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: GoodsSuppliedQueryDto,
  ) {
    return this.goodsSuppliedService.getSupplierPurchaseHistory(
      businessId,
      supplierId,
      query,
    );
  }

  @Get('statistics/summary')
  @Roles(
    SYSTEM_ROLES.OWNER,
    SYSTEM_ROLES.ADMIN,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get supplier statistics' })
  getStatistics(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.goodsSuppliedService.getSupplierStatistics(
      businessId,
      supplierId,
    );
  }
}
