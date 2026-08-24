import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreditSaleItemDto {
  @ApiPropertyOptional({ description: 'Product identifier' })
  @ValidateIf((dto: CreditSaleItemDto) => !dto.barcode && !dto.sku)
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

  @ApiProperty({ description: 'Quantity to sell on credit', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Item-level discount amount',
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  discountAmount?: number = 0;

  @ApiPropertyOptional({
    description: 'Item-level tax amount',
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  taxAmount?: number = 0;
}
