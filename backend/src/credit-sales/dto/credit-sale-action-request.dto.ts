import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditSaleEmployeeAction } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreditSaleActionRequestDto {
  @ApiProperty({ enum: CreditSaleEmployeeAction })
  @IsEnum(CreditSaleEmployeeAction)
  action!: CreditSaleEmployeeAction;

  @ApiPropertyOptional({ description: 'Reason for requesting owner approval' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
