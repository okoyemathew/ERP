import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductReturnRequestDto {
  @ApiProperty({ description: 'Product id', format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    description: 'Original sale item id for the product being returned',
    format: 'uuid',
  })
  @IsUUID()
  saleItemId!: string;

  @ApiProperty({ description: 'Quantity being returned', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Unit cost associated with the return' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Return reference number' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Return remarks' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;
}
