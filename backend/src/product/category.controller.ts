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
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('businesses/:businessId/categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('categories.manage')
  @ApiOperation({ summary: 'Create category' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.categoryService.create(businessId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List categories' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.categoryService.findAll(businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by id' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.categoryService.findOne(businessId, id);
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('categories.manage')
  @ApiOperation({ summary: 'Update category' })
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.categoryService.update(businessId, id, dto);
  }

  @Delete(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('categories.manage')
  @ApiOperation({ summary: 'Deactivate category' })
  remove(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.categoryService.remove(businessId, id);
  }

  private assertBusinessAccess(businessId: string, user: AuthenticatedUser) {
    if (businessId !== user.businessId) {
      throw new ForbiddenException('Access denied to this business');
    }
  }
}
