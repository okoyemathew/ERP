import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';
import { ReportEntityFilterDto } from './sales-report-query.dto';

export class PaymentReportQueryDto extends IntersectionType(
  ReportDateRangeDto,
  ReportEntityFilterDto,
) {
  @ApiPropertyOptional({ description: 'Payment method', enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Search by sale number, payment reference, payment notes, customer, employee, product, SKU, or barcode',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
