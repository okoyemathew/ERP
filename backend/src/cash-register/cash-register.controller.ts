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
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CashRegisterService } from './cash-register.service';
import {
  CashRegisterQueryDto,
  DailyBalanceQueryDto,
} from './dto/cash-register-query.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { OpenRegisterDto } from './dto/open-register.dto';
import { RegisterAdjustmentDto } from './dto/register-adjustment.dto';

const REGISTER_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.CASHIER,
] as const;

@ApiTags('Cash Register')
@ApiBearerAuth()
@Roles(...REGISTER_ROLES)
@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @Post('open')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Open cash register for current user' })
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenRegisterDto) {
    return this.cashRegisterService.open(user.businessId, dto, user);
  }

  @Get('current')
  @ApiOperation({ summary: 'View current open cash register' })
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.cashRegisterService.current(user.businessId, user);
  }

  @Get()
  @Permissions('reports.view')
  @ApiOperation({ summary: 'List cash register sessions' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CashRegisterQueryDto,
  ) {
    return this.cashRegisterService.findAll(user.businessId, query);
  }

  @Get('daily-balance')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'View daily balance' })
  dailyBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DailyBalanceQueryDto,
  ) {
    return this.cashRegisterService.dailyBalance(user.businessId, query);
  }

  @Get(':id')
  @Permissions('reports.view')
  @ApiOperation({ summary: 'View cash register details' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cashRegisterService.findOne(user.businessId, id);
  }

  @Post('adjustment')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Record cash in or cash out adjustment' })
  adjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterAdjustmentDto,
  ) {
    return this.cashRegisterService.adjustment(user.businessId, dto, user);
  }

  @Patch('close')
  @Permissions('sales.manage')
  @ApiOperation({ summary: 'Close current cash register' })
  close(@CurrentUser() user: AuthenticatedUser, @Body() dto: CloseRegisterDto) {
    return this.cashRegisterService.close(user.businessId, dto, user);
  }
}
