import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class OpenRegisterDto {
  @ApiPropertyOptional({ description: 'Opening cash balance', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingBalance?: number = 0;

  @ApiPropertyOptional({ description: 'Opening note', maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
