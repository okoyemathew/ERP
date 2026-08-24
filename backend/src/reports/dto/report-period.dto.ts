import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const REPORT_PERIODS = ['day', 'week', 'month', 'year'] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export class ReportPeriodDto {
  @ApiPropertyOptional({
    description: 'Aggregation period',
    enum: REPORT_PERIODS,
    default: 'day',
  })
  @IsOptional()
  @IsIn(REPORT_PERIODS)
  period?: ReportPeriod = 'day';
}
