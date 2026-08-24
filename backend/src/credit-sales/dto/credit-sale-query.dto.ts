import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreditSaleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const CREDIT_SALE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'dueDate',
  'totalCredit',
  'balance',
  'status',
] as const;

export type CreditSaleSortField = (typeof CREDIT_SALE_SORT_FIELDS)[number];

export class CreditSaleQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Search by sale number, customer name, company, phone, or email',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Search term alias for search routes' })
  @IsOptional()
  @IsString()
  q?: string;

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

  @ApiPropertyOptional({ description: 'Only overdue credit sales' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'Credit sales created on or after this date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Credit sales created on or before this date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

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

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: CREDIT_SALE_SORT_FIELDS,
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(CREDIT_SALE_SORT_FIELDS)
  sortBy?: CreditSaleSortField = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
