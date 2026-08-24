import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsInt, IsDecimal, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGoodsSuppliedItemDto {
  @ApiProperty({ description: 'Product ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ description: 'Quantity received', minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({ description: 'Unit cost', minimum: 0 })
  @IsDecimal({ decimal_digits: '1,2' })
  @Min(0)
  @Type(() => String)
  unitCost!: string;
}
