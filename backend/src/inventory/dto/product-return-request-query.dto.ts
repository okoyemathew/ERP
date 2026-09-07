import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductReturnRequestStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ProductReturnRequestQueryDto {
  @ApiPropertyOptional({
    description: 'Return request status filter',
    enum: ProductReturnRequestStatus,
  })
  @IsOptional()
  @IsEnum(ProductReturnRequestStatus)
  status?: ProductReturnRequestStatus;

  @ApiPropertyOptional({ description: 'Product id filter', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Requester user id filter', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requestedById?: string;

  @ApiPropertyOptional({ description: 'Start date filter' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Search product, requester, or reference' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 20, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
