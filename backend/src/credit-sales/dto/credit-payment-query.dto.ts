import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const CREDIT_PAYMENT_SORT_FIELDS = [
  'paymentDate',
  'amount',
  'createdAt',
] as const;
const CREDIT_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.MOBILE_MONEY,
  PaymentMethod.CARD,
] as const;

export type CreditPaymentSortField =
  (typeof CREDIT_PAYMENT_SORT_FIELDS)[number];

export class CreditPaymentQueryDto {
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
    description: 'Search by reference number, notes, or sale number',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Payment method',
    enum: CREDIT_PAYMENT_METHODS,
  })
  @IsOptional()
  @IsIn(CREDIT_PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Payments on or after this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'Payments on or before this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: CREDIT_PAYMENT_SORT_FIELDS,
    default: 'paymentDate',
  })
  @IsOptional()
  @IsIn(CREDIT_PAYMENT_SORT_FIELDS)
  sortBy?: CreditPaymentSortField = 'paymentDate';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
