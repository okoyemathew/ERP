import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class StockAdjustmentRequestDto {
  @ApiProperty({ description: 'Product id', format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'Adjustment quantity', minimum: 1, example: 15 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    enum: AdjustmentType,
    description: 'Increase or decrease adjustment',
    example: AdjustmentType.INCREASE,
  })
  @IsEnum(AdjustmentType)
  adjustmentType!: AdjustmentType;

  @ApiProperty({ description: 'Reason for the adjustment' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ description: 'Reference number' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Approved by user name' })
  @IsOptional()
  @IsString()
  approvedBy?: string;

  @ApiPropertyOptional({
    description: 'Device identifier for offline/mobile submissions',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
