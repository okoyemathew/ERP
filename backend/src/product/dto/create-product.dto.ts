import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ description: 'Category identifier', format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiPropertyOptional({ description: 'Brand identifier', format: 'uuid' })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ description: 'Supplier identifier', format: 'uuid' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiProperty({ description: 'Unit identifier', format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  @ApiProperty({ description: 'Product name', minLength: 2, maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description: 'Stock keeping unit',
    minLength: 2,
    maxLength: 80,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  sku!: string;

  @ApiPropertyOptional({ description: 'Product barcode', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  @ApiPropertyOptional({ description: 'Product description', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Purchase price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice!: number;

  @ApiProperty({ description: 'Selling price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice!: number;

  @ApiPropertyOptional({
    description: 'Owner-controlled minimum selling price',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseSellingPrice?: number;

  @ApiPropertyOptional({ description: 'Wholesale price', minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number;

  @ApiPropertyOptional({ description: 'Minimum stock level', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional({ description: 'Maximum stock level', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumStock?: number;

  @ApiPropertyOptional({
    description: 'Initial stock quantity added when creating the product',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether the product is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
