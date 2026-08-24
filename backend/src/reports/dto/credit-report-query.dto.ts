import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { CreditSaleStatus, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';
import { ReportPaginationDto } from './report-pagination.dto';

export class CreditReportQueryDto extends IntersectionType(
  ReportDateRangeDto,
  ReportPaginationDto,
) {
  @ApiPropertyOptional({ description: 'Customer identifier' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Credit sale status',
    enum: CreditSaleStatus,
  })
  @IsOptional()
  @IsEnum(CreditSaleStatus)
  status?: CreditSaleStatus;

  @ApiPropertyOptional({ description: 'Payment method', enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Only overdue credit sales' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Credits due on or after this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueFrom?: Date;

  @ApiPropertyOptional({ description: 'Credits due on or before this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueTo?: Date;
}
