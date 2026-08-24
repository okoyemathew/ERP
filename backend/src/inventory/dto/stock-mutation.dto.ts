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

export class StockMutationDto {
  @ApiProperty({ description: 'Product id', format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'Quantity to apply', minimum: 1, example: 25 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    enum: Object.values(InventoryTransactionType),
    description: 'Inventory transaction type',
  })
  @IsEnum(InventoryTransactionType)
  transactionType!: InventoryTransactionType;

  @ApiPropertyOptional({ description: 'Reference number' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Transaction remarks' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @ApiPropertyOptional({
    description: 'Unit cost associated with the movement',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({
    description: 'Device identifier for offline/mobile submissions',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;
}
