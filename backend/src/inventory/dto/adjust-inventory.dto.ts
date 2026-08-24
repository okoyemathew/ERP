import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryTransactionType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class AdjustInventoryDto {
  @ApiProperty({
    description: 'Product id to adjust stock for',
    format: 'uuid',
  })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    description:
      'Stock change quantity. Positive values increase stock, negative decrease it.',
    example: 10,
  })
  @IsInt()
  quantity!: number;

  @ApiProperty({
    enum: InventoryTransactionType,
    description: 'Inventory transaction type',
    example: InventoryTransactionType.ADJUSTMENT,
  })
  @IsEnum(InventoryTransactionType)
  transactionType!: InventoryTransactionType;

  @ApiPropertyOptional({ description: 'Reference number for the transaction' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Per-unit cost when adjusting inventory',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Adjustment reason' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional remarks about the adjustment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;
}
