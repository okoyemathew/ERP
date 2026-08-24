import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CloseRegisterDto {
  @ApiProperty({ description: 'Actual counted cash balance', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualBalance!: number;

  @ApiPropertyOptional({ description: 'Closing note', maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
