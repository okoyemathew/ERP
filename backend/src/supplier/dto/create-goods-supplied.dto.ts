import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateGoodsSuppliedItemDto } from './create-goods-supplied-item.dto';

export class CreateGoodsSuppliedDto {
  @ApiPropertyOptional({
    description: 'Supply number (auto-generated if not provided)',
  })
  @IsOptional()
  @IsString()
  supplyNumber?: string;

  @ApiPropertyOptional({
    description: 'Date goods were supplied',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  suppliedDate?: string;

  @ApiPropertyOptional({
    description: 'Notes or remarks about the delivery',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({
    description: 'Items being received',
    type: [CreateGoodsSuppliedItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsSuppliedItemDto)
  items!: CreateGoodsSuppliedItemDto[];
}
