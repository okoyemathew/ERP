import { ApiProperty } from '@nestjs/swagger';

export class BusinessDashboardSummaryDto {
  @ApiProperty({ description: 'Number of completed sales today' })
  totalSalesToday!: number;

  @ApiProperty({ description: 'Total revenue collected from sales today' })
  totalRevenueToday!: number;

  @ApiProperty({ description: 'Total payments received today' })
  totalPaymentsToday!: number;

  @ApiProperty({ description: 'Total expenses recorded today' })
  totalExpensesToday!: number;

  @ApiProperty({ description: 'Total outstanding balance for credit sales' })
  outstandingCreditBalance!: number;

  @ApiProperty({ description: 'Number of active customers' })
  activeCustomersCount!: number;

  @ApiProperty({ description: 'Number of active suppliers' })
  activeSuppliersCount!: number;

  @ApiProperty({ description: 'Number of products with available stock' })
  availableProductsCount!: number;

  @ApiProperty({ description: 'Number of products below reorder level' })
  lowStockProductsCount!: number;

  @ApiProperty({ description: 'Number of active branches' })
  branchesCount!: number;

  @ApiProperty({ description: 'Number of active users' })
  activeUsersCount!: number;
}
