import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateGoodsDisbursementItemDto {
  @ApiProperty({ description: 'Product identifier', format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'Quantity to disburse', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Item remarks' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateGoodsDisbursementDto {
  @ApiPropertyOptional({ description: 'Employee recipient identifier', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Disbursement number' })
  @IsOptional()
  @IsString()
  disbursementNumber?: string;

  @ApiPropertyOptional({ description: 'Disbursement date' })
  @IsOptional()
  @IsDateString()
  disbursementDate?: string;

  @ApiPropertyOptional({ description: 'Destination or recipient' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: 'General remarks' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ type: [CreateGoodsDisbursementItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsDisbursementItemDto)
  items!: CreateGoodsDisbursementItemDto[];
}
