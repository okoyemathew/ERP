import { ApiProperty } from '@nestjs/swagger';

export class BusinessDailyTrendDto {
  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  date!: string;

  @ApiProperty({ description: 'Total revenue for the date' })
  revenue!: number;

  @ApiProperty({ description: 'Total sales count for the date' })
  salesCount!: number;
}

export class BusinessAmountTrendDto {
  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  date!: string;

  @ApiProperty({ description: 'Amount for the date' })
  amount!: number;
}

export class BusinessStatisticsDto {
  @ApiProperty({ type: [BusinessDailyTrendDto] })
  salesLast7Days!: BusinessDailyTrendDto[];

  @ApiProperty({ type: [BusinessAmountTrendDto] })
  paymentsLast7Days!: BusinessAmountTrendDto[];

  @ApiProperty({ type: [BusinessAmountTrendDto] })
  expensesLast7Days!: BusinessAmountTrendDto[];

  @ApiProperty({ description: 'Average daily revenue over the past 7 days' })
  averageDailyRevenue!: number;

  @ApiProperty({ description: 'Outstanding credit sales balance' })
  creditSalesBalance!: number;
}
