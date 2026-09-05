import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const EXPENSE_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.MOBILE_MONEY,
  PaymentMethod.CARD,
] as const;

export class CreateExpenseDto {
  @ApiProperty({ description: 'Expense title', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({ description: 'Expense description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Expense amount', minimum: 0.01 })
  @Type(() => Number)
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'Expense category identifier' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Expense date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expenseDate?: Date;

  @ApiPropertyOptional({ description: 'Receipt number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptNumber?: string;

  @ApiPropertyOptional({ description: 'Vendor name', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  vendor?: string;

  @ApiProperty({
    description: 'Payment method',
    enum: EXPENSE_PAYMENT_METHODS,
  })
  @IsIn(EXPENSE_PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Device identifier', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;
}
