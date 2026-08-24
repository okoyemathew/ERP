import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  lowStockAlert?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockLevel?: number;

  @IsOptional()
  @IsBoolean()
  dailySalesSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklySalesSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  monthlySalesSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}
