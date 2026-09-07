import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreditSalePermissionsDto {
  @ApiPropertyOptional({ description: 'Allow employee to edit own credit sales' })
  @IsOptional()
  @IsBoolean()
  canEditCreditSales?: boolean;

  @ApiPropertyOptional({ description: 'Allow employee to delete own credit sales' })
  @IsOptional()
  @IsBoolean()
  canDeleteCreditSales?: boolean;

  @ApiPropertyOptional({ description: 'Reason for permission change' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
