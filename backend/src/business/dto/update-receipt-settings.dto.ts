import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const PAPER_WIDTHS = ['58mm', '80mm'] as const;

export class UpdateReceiptSettingsDto {
  @ApiPropertyOptional({ description: 'Business name displayed on receipts' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({
    description: 'Business address displayed on receipts',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  businessAddress?: string;

  @ApiPropertyOptional({ description: 'Business phone displayed on receipts' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  businessPhone?: string;

  @ApiPropertyOptional({
    description: 'Thermal printer paper width',
    enum: PAPER_WIDTHS,
  })
  @IsOptional()
  @IsString()
  @IsIn(PAPER_WIDTHS)
  paperWidth?: string;

  @ApiPropertyOptional({ description: 'Footer message printed on receipts' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerMessage?: string;

  @ApiPropertyOptional({ description: 'Request auto-print in client apps' })
  @IsOptional()
  @IsBoolean()
  autoPrint?: boolean;

  @ApiPropertyOptional({ description: 'Show logo on receipt where supported' })
  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;
}
