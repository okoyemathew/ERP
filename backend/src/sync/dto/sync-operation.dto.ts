import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateSaleDto } from '../../sales/dto/create-sale.dto';
import { CreateExpenseDto } from '../../expenses/dto/create-expense.dto';

export const SYNC_OPERATION_TYPES = ['SALE_CREATE', 'EXPENSE_CREATE'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export class SyncOperationDto {
  @ApiProperty({ description: 'Client-generated operation id/idempotency key' })
  @IsString()
  @MaxLength(120)
  operationId!: string;

  @ApiProperty({ enum: SYNC_OPERATION_TYPES })
  @IsIn(SYNC_OPERATION_TYPES)
  type!: SyncOperationType;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;

  @ApiProperty({ description: 'Operation payload' })
  @IsObject()
  payload!: CreateSaleDto | CreateExpenseDto;
}

export class SyncBatchDto {
  @ApiProperty({ type: [SyncOperationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}
