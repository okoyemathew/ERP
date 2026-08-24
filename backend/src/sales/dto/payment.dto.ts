import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PaymentDto {
  @ApiProperty({ description: 'Payment method', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty({ description: 'Payment amount', minimum: 0 })
  @Type(() => Number)
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ description: 'External payment reference' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Payment note' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Allow this payment to exceed the amount due and treat the excess as change',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowChange?: boolean = false;
}
