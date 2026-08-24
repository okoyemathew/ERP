import { ApiProperty } from '@nestjs/swagger';

export class SupplierStatisticsDto {
  @ApiProperty({ description: 'Total number of purchase orders' })
  totalPurchaseOrders!: number;

  @ApiProperty({ description: 'Number of completed/received purchase orders' })
  completedPurchaseOrders!: number;

  @ApiProperty({ description: 'Number of pending/approved purchase orders' })
  activePurchaseOrders!: number;

  @ApiProperty({ description: 'Total number of goods supplied records' })
  totalGoodsSupplied!: number;

  @ApiProperty({ description: 'Total quantity of items received' })
  totalItemsReceived!: number;

  @ApiProperty({
    description: 'Total amount spent with this supplier',
    type: 'number',
  })
  totalAmountSpent!: number;

  @ApiProperty({
    description: 'Outstanding balance with supplier',
    type: 'number',
  })
  outstandingBalance!: number;

  @ApiProperty({ description: 'Number of products supplied' })
  productsSupplied!: number;

  @ApiProperty({ description: 'Last goods supply date' })
  lastSupplyDate?: Date;
}
