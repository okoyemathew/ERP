import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UnitService } from './unit.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@ApiTags('Units')
@ApiBearerAuth()
@Controller('businesses/:businessId/units')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Post()
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('units.manage')
  @ApiOperation({ summary: 'Create unit' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateUnitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.unitService.create(businessId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List units' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.unitService.findAll(businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get unit by id' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.unitService.findOne(businessId, id);
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('units.manage')
  @ApiOperation({ summary: 'Update unit' })
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.unitService.update(businessId, id, dto);
  }

  @Delete(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('units.manage')
  @ApiOperation({ summary: 'Deactivate unit' })
  remove(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.unitService.remove(businessId, id);
  }

  private assertBusinessAccess(businessId: string, user: AuthenticatedUser) {
    if (businessId !== user.businessId) {
      throw new ForbiddenException('Access denied to this business');
    }
  }
}
