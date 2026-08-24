import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProductBarcodeDto {
  @ApiProperty({ description: 'Barcode value', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  barcode!: string;

  @ApiPropertyOptional({
    description: 'Barcode type',
    enum: ['EAN13', 'CODE128', 'QR', 'UPC', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  barcodeType?: string;

  @ApiPropertyOptional({
    description: 'Whether this is the primary barcode',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
