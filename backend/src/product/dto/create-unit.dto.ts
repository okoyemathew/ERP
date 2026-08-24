import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ description: 'Unit name', minLength: 1, maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ description: 'Unit symbol', minLength: 1, maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20)
  symbol!: string;

  @ApiPropertyOptional({ description: 'Unit description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether the unit is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
