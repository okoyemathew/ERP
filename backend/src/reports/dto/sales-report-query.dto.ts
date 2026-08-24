import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';
import { ReportPeriodDto } from './report-period.dto';

export class ReportEntityFilterDto {
  @ApiPropertyOptional({
    description: 'Employee identifier from the Employee module',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'User identifier for cashier/salesperson filtering',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Customer identifier' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Product identifier' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Product category identifier' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Supplier identifier. Applied through product category supplier linkage where available.',
  })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Branch identifier' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class SalesReportQueryDto extends IntersectionType(
  ReportDateRangeDto,
  ReportEntityFilterDto,
) {
  @ApiPropertyOptional({ description: 'Payment method', enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Search by sale number, remarks, customer, employee, product, SKU, barcode, or payment reference',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class SalesPeriodReportQueryDto extends IntersectionType(
  SalesReportQueryDto,
  ReportPeriodDto,
) {}
