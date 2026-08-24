import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashRegisterStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CashRegisterQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Register status',
    enum: CashRegisterStatus,
  })
  @IsOptional()
  @IsEnum(CashRegisterStatus)
  status?: CashRegisterStatus;

  @ApiPropertyOptional({ description: 'Register user identifier' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Opened on or after this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'Opened on or before this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

export class DailyBalanceQueryDto {
  @ApiPropertyOptional({ description: 'Balance date; defaults to today' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}
