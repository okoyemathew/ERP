import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashTransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const MANUAL_REGISTER_TRANSACTION_TYPES = [
  CashTransactionType.CASH_IN,
  CashTransactionType.CASH_OUT,
] as const;

export class RegisterAdjustmentDto {
  @ApiProperty({
    description: 'Adjustment type',
    enum: MANUAL_REGISTER_TRANSACTION_TYPES,
  })
  @IsIn(MANUAL_REGISTER_TRANSACTION_TYPES)
  transactionType!: CashTransactionType;

  @ApiProperty({ description: 'Adjustment amount', minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'Reference number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({
    description: 'Adjustment description',
    maxLength: 250,
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;
}
