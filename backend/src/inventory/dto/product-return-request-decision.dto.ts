import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProductReturnRequestDecisionDto {
  @ApiPropertyOptional({ description: 'Approval or rejection note' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;
}
