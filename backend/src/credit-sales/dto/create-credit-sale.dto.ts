import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreditSaleItemDto } from './credit-sale-item.dto';
import { CreateCreditPaymentDto } from './create-credit-payment.dto';

export class CreateCreditSaleDto {
  @ApiProperty({ description: 'Active customer identifier' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({
    type: [CreditSaleItemDto],
    description: 'Products sold on credit',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreditSaleItemDto)
  items!: CreditSaleItemDto[];

  @ApiPropertyOptional({
    type: [CreateCreditPaymentDto],
    description:
      'Optional upfront payments collected before the remaining amount becomes credit',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCreditPaymentDto)
  initialPayments?: CreateCreditPaymentDto[];

  @ApiPropertyOptional({ description: 'Credit due date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @ApiPropertyOptional({ description: 'Sale remarks' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
