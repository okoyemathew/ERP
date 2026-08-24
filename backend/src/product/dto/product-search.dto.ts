import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProductSearchDto {
  @ApiPropertyOptional({ description: 'Barcode to search for' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  @ApiPropertyOptional({ description: 'SKU to search for' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @ApiPropertyOptional({ description: 'Category name to search for' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: 'Brand name to search for' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiPropertyOptional({ description: 'Unit name or symbol to search for' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;
}
