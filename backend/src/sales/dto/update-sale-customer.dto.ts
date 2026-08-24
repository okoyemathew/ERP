import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateSaleCustomerDto {
  @ApiPropertyOptional({
    description: 'Customer identifier. Omit or null for walk-in/cash customer.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
