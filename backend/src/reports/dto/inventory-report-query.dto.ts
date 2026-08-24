import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { InventoryTransactionType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';
import { ReportPaginationDto } from './report-pagination.dto';

const INVENTORY_MOVEMENT_SORT_FIELDS = [
  'transactionDate',
  'quantity',
  'transactionType',
  'createdAt',
] as const;

export type InventoryMovementSortField =
  (typeof INVENTORY_MOVEMENT_SORT_FIELDS)[number];

export class InventoryReportQueryDto extends IntersectionType(
  ReportDateRangeDto,
  ReportPaginationDto,
) {
  @ApiPropertyOptional({ description: 'Product identifier' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Product category identifier' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Supplier identifier. Applied through product category supplier linkage where available.',
  })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Inventory transaction type',
    enum: InventoryTransactionType,
  })
  @IsOptional()
  @IsEnum(InventoryTransactionType)
  transactionType?: InventoryTransactionType;

  @ApiPropertyOptional({
    description: 'Sort field for movement history',
    enum: INVENTORY_MOVEMENT_SORT_FIELDS,
    default: 'transactionDate',
  })
  @IsOptional()
  @IsIn(INVENTORY_MOVEMENT_SORT_FIELDS)
  sortBy?: InventoryMovementSortField = 'transactionDate';

  @ApiPropertyOptional({ description: 'SKU filter' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Barcode filter' })
  @IsOptional()
  @IsString()
  barcode?: string;
}
