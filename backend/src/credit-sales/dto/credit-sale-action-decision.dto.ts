import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreditSaleActionDecisionDto {
  @ApiPropertyOptional({ description: 'Optional owner note for this decision' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
