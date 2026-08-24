import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEmail,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiPropertyOptional({ description: 'Supplier code' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierCode?: string;

  @ApiProperty({ description: 'Company name', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName!: string;

  @ApiPropertyOptional({ description: 'Contact person', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string;

  @ApiPropertyOptional({ description: 'Supplier email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Supplier phone number' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9\s-()]+$/, { message: 'Phone number is invalid' })
  phone!: string;

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

  @ApiPropertyOptional({ description: 'Tax number' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiPropertyOptional({ description: 'Outstanding balance', minimum: 0 })
  @IsOptional()
  @Min(0)
  outstandingBalance?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Supplier status',
    enum: SupplierStatus,
    default: SupplierStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
