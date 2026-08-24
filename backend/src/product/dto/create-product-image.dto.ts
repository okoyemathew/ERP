import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProductImageDto {
  @ApiProperty({ description: 'Image URL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  imageUrl!: string;

  @ApiProperty({
    description: 'Whether this is the primary product image',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
