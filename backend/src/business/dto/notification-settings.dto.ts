import { ApiProperty } from '@nestjs/swagger';

export class NotificationSettingsDto {
  @ApiProperty({ description: 'Whether low stock alerts are enabled' })
  lowStockAlert!: boolean;

  @ApiProperty({ description: 'Low stock threshold level' })
  lowStockLevel!: number;

  @ApiProperty({ description: 'Whether daily sales summaries are enabled' })
  dailySalesSummary!: boolean;

  @ApiProperty({ description: 'Whether weekly sales summaries are enabled' })
  weeklySalesSummary!: boolean;

  @ApiProperty({ description: 'Whether monthly sales summaries are enabled' })
  monthlySalesSummary!: boolean;

  @ApiProperty({ description: 'Whether push notifications are enabled' })
  pushNotifications!: boolean;

  @ApiProperty({ description: 'Whether email notifications are enabled' })
  emailNotifications!: boolean;
}
