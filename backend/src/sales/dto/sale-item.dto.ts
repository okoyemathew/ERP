import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SaleItemDto {
  @ApiPropertyOptional({ description: 'Product identifier' })
  @ValidateIf((dto: SaleItemDto) => !dto.barcode && !dto.sku)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Product barcode' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string;

  @ApiPropertyOptional({ description: 'Product SKU' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @ApiProperty({ description: 'Quantity to sell', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Actual selling price used for this sale item',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({
    description: 'Item-level discount amount',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  discountAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Item-level tax amount', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  taxAmount?: number = 0;

  @ApiPropertyOptional({
    description: 'Optional note for internal clients',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;
}

export class AddSaleItemDto extends SaleItemDto {}

export class RemoveSaleItemDto {
  @ApiProperty({ description: 'Sale item identifier' })
  @IsUUID()
  saleItemId!: string;
}
