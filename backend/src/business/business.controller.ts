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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';
import { UpdateReceiptSettingsDto } from './dto/update-receipt-settings.dto';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { BusinessDashboardSummaryDto } from './dto/business-dashboard-summary.dto';
import { BusinessStatisticsDto } from './dto/business-statistics.dto';
import { BusinessConfigDto } from './dto/business-config.dto';
import { BusinessAuditLogQueryDto } from './dto/business-audit-log-query.dto';
import { BusinessAuditLogPageDto } from './dto/business-audit-log-page.dto';

interface UploadFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

@ApiTags('Business')
@ApiBearerAuth()
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('businesses.manage')
  @ApiOperation({ summary: 'Create a new business' })
  @ApiResponse({ status: 201, description: 'Business created successfully' })
  create(
    @Body() createBusinessDto: CreateBusinessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.create(createBusinessDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all businesses' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.businessService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve business by id' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('businesses.manage')
  @ApiOperation({ summary: 'Update business profile details' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBusinessDto: UpdateBusinessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.update(id, updateBusinessDto, user);
  }

  @Delete(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('businesses.manage')
  @ApiOperation({ summary: 'Remove a business' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.remove(id, user);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Retrieve a business profile with settings' })
  profile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.profile(id, user);
  }

  @Get(':id/config')
  @ApiOperation({ summary: 'Retrieve business configuration and settings' })
  @ApiResponse({ status: 200, type: BusinessConfigDto })
  config(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.getConfig(id, user);
  }

  @Get(':id/dashboard/summary')
  @ApiOperation({ summary: 'Get business dashboard summary' })
  @ApiResponse({ status: 200, type: BusinessDashboardSummaryDto })
  dashboardSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.getDashboardSummary(id, user);
  }

  @Get(':id/dashboard/statistics')
  @ApiOperation({ summary: 'Get business dashboard statistics' })
  @ApiResponse({ status: 200, type: BusinessStatisticsDto })
  dashboardStatistics(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.getDashboardStatistics(id, user);
  }

  @Get(':id/audit-logs')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('audit-logs.view')
  @ApiOperation({ summary: 'List audit logs for a business' })
  @ApiResponse({ status: 200, type: BusinessAuditLogPageDto })
  auditLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BusinessAuditLogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.listAuditLogs(id, query, user);
  }

  @Get(':id/roles')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @Permissions('employees.manage')
  @ApiOperation({ summary: 'List roles for employee assignment' })
  roles(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.listRoles(id, user);
  }

  @Get(':id/permissions')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'List permissions for a business' })
  permissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.listPermissions(id, user);
  }

  @Patch(':id/settings')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Update business settings' })
  updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBusinessSettingsDto: UpdateBusinessSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.updateSettings(
      id,
      updateBusinessSettingsDto,
      user,
    );
  }

  @Patch(':id/settings/receipt')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('receipt.manage')
  @ApiOperation({ summary: 'Update receipt settings' })
  @ApiResponse({
    status: 200,
    description:
      'Receipt settings updated, including footer text and 58mm/80mm paper width',
  })
  updateReceiptSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateReceiptSettingsDto: UpdateReceiptSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.updateReceiptSettings(
      id,
      updateReceiptSettingsDto,
      user,
    );
  }

  @Patch(':id/settings/tax')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Update tax settings' })
  updateTaxSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaxSettingsDto: UpdateTaxSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.updateTaxSettings(
      id,
      updateTaxSettingsDto,
      user,
    );
  }

  @Patch(':id/settings/notifications')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('notifications.manage')
  @ApiOperation({ summary: 'Update notification settings' })
  updateNotificationSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateNotificationSettingsDto: UpdateNotificationSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.updateNotificationSettings(
      id,
      updateNotificationSettingsDto,
      user,
    );
  }

  @Patch(':id/logo')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('businesses.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Prepare a business logo upload' })
  uploadLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.businessService.prepareUploadLogo(id, file, user);
  }
}
