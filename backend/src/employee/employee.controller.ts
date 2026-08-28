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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AssignEmployeeRoleDto } from './dto/assign-employee-role.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeActivityQueryDto } from './dto/employee-activity-query.dto';
import { EmployeeLoginAccessDto } from './dto/employee-login-access.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { EmployeeStatusDto } from './dto/employee-status.dto';
import { PermissionVerificationDto } from './dto/permission-verification.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeService } from './employee.service';

const EMPLOYEE_READ_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
] as const;

@ApiTags('Employees')
@ApiBearerAuth()
@Permissions('employees.manage')
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Create employee' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeeService.create(user.businessId, dto, user);
  }

  @Get()
  @Roles(...EMPLOYEE_READ_ROLES)
  @ApiOperation({ summary: 'List employees' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeeService.findAll(user.businessId, query);
  }

  @Get('search')
  @Roles(...EMPLOYEE_READ_ROLES)
  @ApiOperation({ summary: 'Search employees' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q: string,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeeService.search(user.businessId, q ?? '', query);
  }

  @Get(':id')
  @Roles(...EMPLOYEE_READ_ROLES)
  @ApiOperation({ summary: 'View employee' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employeeService.findOne(user.businessId, id);
  }

  @Get(':id/profile')
  @Roles(...EMPLOYEE_READ_ROLES)
  @ApiOperation({ summary: 'View employee profile' })
  profile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employeeService.getProfile(user.businessId, id);
  }

  @Get(':id/sales')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'View employee sales' })
  sales(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EmployeeActivityQueryDto,
  ) {
    return this.employeeService.getSales(user.businessId, id, query);
  }

  @Get(':id/sales/print')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Print employee sales record' })
  printSales(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EmployeeActivityQueryDto,
  ) {
    return this.employeeService.printSalesRecord(user.businessId, id, query);
  }

  @Get(':id/activity')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'View employee activity' })
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EmployeeActivityQueryDto,
  ) {
    return this.employeeService.getActivity(user.businessId, id, query);
  }

  @Get(':id/performance')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'View employee performance' })
  performance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EmployeeActivityQueryDto,
  ) {
    return this.employeeService.getPerformance(user.businessId, id, query);
  }

  @Get(':id/audit-log')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'View employee audit log' })
  auditLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EmployeeActivityQueryDto,
  ) {
    return this.employeeService.getAuditLog(user.businessId, id, query);
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Update employee' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.update(user.businessId, id, dto, user);
  }

  @Patch(':id/role')
  @Permissions('roles.manage')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @ApiOperation({ summary: 'Assign employee role' })
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignEmployeeRoleDto,
  ) {
    return this.employeeService.assignRole(user.businessId, id, dto, user);
  }

  @Patch(':id/login-access')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Enable or disable employee login' })
  setLoginAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeLoginAccessDto,
  ) {
    return this.employeeService.setLoginAccess(user.businessId, id, dto, user);
  }

  @Post(':id/permissions/verify')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Verify employee permissions' })
  verifyPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PermissionVerificationDto,
  ) {
    return this.employeeService.verifyPermissions(user.businessId, id, dto);
  }

  @Patch(':id/activate')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Activate employee' })
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeStatusDto,
  ) {
    return this.employeeService.activate(user.businessId, id, dto, user);
  }

  @Patch(':id/deactivate')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Deactivate employee' })
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeStatusDto,
  ) {
    return this.employeeService.deactivate(user.businessId, id, dto, user);
  }

  @Patch(':id/suspend')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER)
  @ApiOperation({ summary: 'Suspend employee' })
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeStatusDto,
  ) {
    return this.employeeService.suspend(user.businessId, id, dto, user);
  }

  @Patch(':id/terminate')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @ApiOperation({ summary: 'Terminate employee' })
  terminate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeStatusDto,
  ) {
    return this.employeeService.terminate(user.businessId, id, dto, user);
  }
}
