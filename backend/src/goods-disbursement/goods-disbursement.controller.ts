import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { CreateGoodsDisbursementDto } from './dto/create-goods-disbursement.dto';
import { GoodsDisbursementQueryDto } from './dto/goods-disbursement-query.dto';
import { GoodsDisbursementService } from './goods-disbursement.service';

const DISBURSEMENT_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_OFFICER,
] as const;

@ApiTags('Goods Disbursement')
@ApiBearerAuth()
@Permissions('goods-disbursement.manage')
@Roles(...DISBURSEMENT_ROLES)
@Controller('businesses/:businessId/goods-disbursements')
export class GoodsDisbursementController {
  constructor(
    private readonly goodsDisbursementService: GoodsDisbursementService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create goods disbursement' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateGoodsDisbursementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.goodsDisbursementService.create(businessId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List goods disbursements' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: GoodsDisbursementQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.goodsDisbursementService.findAll(businessId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get goods disbursement details' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.goodsDisbursementService.findOne(businessId, id);
  }

  private assertBusinessAccess(businessId: string, user: AuthenticatedUser) {
    if (businessId !== user.businessId) {
      throw new ForbiddenException('Access denied to this business');
    }
  }
}
