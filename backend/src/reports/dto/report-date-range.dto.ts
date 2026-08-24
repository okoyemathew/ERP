import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';

export const REPORT_DATE_PRESETS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_year',
  'last_year',
  'custom',
] as const;

export type ReportDatePreset = (typeof REPORT_DATE_PRESETS)[number];

export class ReportDateRangeDto {
  @ApiPropertyOptional({
    description:
      'Business-timezone date preset. Use custom with startDate and endDate for explicit ranges.',
    enum: REPORT_DATE_PRESETS,
  })
  @IsOptional()
  @IsIn(REPORT_DATE_PRESETS)
  datePreset?: ReportDatePreset;

  @ApiPropertyOptional({
    description: 'Report start date. Defaults depend on the selected report.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Report end date. Defaults depend on the selected report.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
