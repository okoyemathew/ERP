import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { PurchaseOrderStatus, SupplierStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';
import { ReportPaginationDto } from './report-pagination.dto';

export class SupplierReportQueryDto extends IntersectionType(
  ReportDateRangeDto,
  ReportPaginationDto,
) {
  @ApiPropertyOptional({ description: 'Supplier identifier' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Supplier status', enum: SupplierStatus })
  @IsOptional()
  @IsEnum(SupplierStatus)
  supplierStatus?: SupplierStatus;

  @ApiPropertyOptional({
    description: 'Purchase order status',
    enum: PurchaseOrderStatus,
  })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  purchaseOrderStatus?: PurchaseOrderStatus;
}
