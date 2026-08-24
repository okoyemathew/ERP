import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReceivePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Remarks for receipt' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
