import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID, Min } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';
import { ReportPaginationDto } from './report-pagination.dto';
import { ReportPeriodDto } from './report-period.dto';

export class ExpenseReportFilterDto {
  @ApiPropertyOptional({ description: 'Expense category identifier' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'User who recorded the expense' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Employee identifier' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Payment method', enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Minimum expense amount' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum expense amount' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxAmount?: number;
}

export class ExpenseReportQueryDto extends IntersectionType(
  IntersectionType(ReportDateRangeDto, ReportPaginationDto),
  ExpenseReportFilterDto,
) {}

export class ExpensePeriodReportQueryDto extends IntersectionType(
  ExpenseReportQueryDto,
  ReportPeriodDto,
) {}
