import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { SYSTEM_ROLES } from '../../auth/constants/roles.constant';

const SUPPORTED_EMPLOYEE_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.SALESPERSON,
  SYSTEM_ROLES.INVENTORY_OFFICER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.SUPERVISOR,
] as const;

export class AssignEmployeeRoleDto {
  @ApiPropertyOptional({
    description: 'Role identifier. Preferred when known.',
  })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({
    description: 'Supported role name',
    enum: SUPPORTED_EMPLOYEE_ROLES,
  })
  @IsOptional()
  @IsIn(SUPPORTED_EMPLOYEE_ROLES)
  roleName?: (typeof SUPPORTED_EMPLOYEE_ROLES)[number];

  @ApiPropertyOptional({ description: 'Reason for role assignment' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
