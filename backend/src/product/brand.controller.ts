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
import { BrandService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@ApiTags('Brands')
@ApiBearerAuth()
@Controller('businesses/:businessId/brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('brands.manage')
  @ApiOperation({ summary: 'Create brand' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateBrandDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.brandService.create(businessId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List brands' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.brandService.findAll(businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get brand by id' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.brandService.findOne(businessId, id);
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('brands.manage')
  @ApiOperation({ summary: 'Update brand' })
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.brandService.update(businessId, id, dto);
  }

  @Delete(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('brands.manage')
  @ApiOperation({ summary: 'Deactivate brand' })
  remove(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.brandService.remove(businessId, id);
  }

  private assertBusinessAccess(businessId: string, user: AuthenticatedUser) {
    if (businessId !== user.businessId) {
      throw new ForbiddenException('Access denied to this business');
    }
  }
}
