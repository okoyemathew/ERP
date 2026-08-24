import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({ description: 'Employee code', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  employeeCode!: string;

  @ApiProperty({ description: 'First name', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName!: string;

  @ApiProperty({ description: 'Last name', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName!: string;

  @ApiProperty({ description: 'Username for login', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  username!: string;

  @ApiProperty({ description: 'Initial password', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'Password must contain uppercase, lowercase, number, and special character',
  })
  password!: string;

  @ApiPropertyOptional({ description: 'Role identifier' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Branch identifier' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Gender', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @ApiPropertyOptional({ description: 'Date of birth' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-()]+$/, { message: 'Phone number is invalid' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State or province' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Emergency contact name' })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'Emergency contact phone' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-()]+$/, {
    message: 'Emergency contact phone is invalid',
  })
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ description: 'Department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Designation' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({ description: 'Hire date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  hireDate?: Date;

  @ApiPropertyOptional({ description: 'Salary', minimum: 0 })
  @IsOptional()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsString()
  profileImage?: string;

  @ApiPropertyOptional({
    description: 'Employee status',
    enum: EmployeeStatus,
    default: EmployeeStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ description: 'Allow employee login', default: true })
  @IsOptional()
  @IsBoolean()
  canLogin?: boolean;

  @ApiPropertyOptional({ description: 'Allow sales', default: true })
  @IsOptional()
  @IsBoolean()
  canSell?: boolean;

  @ApiPropertyOptional({
    description: 'Allow stock management',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canManageStock?: boolean;

  @ApiPropertyOptional({
    description: 'Allow expense management',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canManageExpenses?: boolean;

  @ApiPropertyOptional({ description: 'Allow receipt printing', default: true })
  @IsOptional()
  @IsBoolean()
  canPrintReceipt?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
