import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'Supplier ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'Order number', maxLength: 100 })
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @ApiPropertyOptional({
    description: 'Expected delivery date',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional({ description: 'Notes', maxLength: 500 })
  @IsOptional()
  @IsString()
  notes?: string;
}
