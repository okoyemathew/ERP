import { ApiProperty } from '@nestjs/swagger';

export class ReceiptSettingsDto {
  @ApiProperty({
    description: 'Business name displayed on receipts',
    required: false,
  })
  businessName?: string | null;

  @ApiProperty({
    description: 'Business address displayed on receipts',
    required: false,
  })
  businessAddress?: string | null;

  @ApiProperty({
    description: 'Business phone displayed on receipts',
    required: false,
  })
  businessPhone?: string | null;

  @ApiProperty({ description: 'Receipt footer message', required: false })
  footerMessage?: string | null;

  @ApiProperty({ description: 'Whether receipt logo is shown' })
  showLogo!: boolean;

  @ApiProperty({ description: 'Whether receipts are auto printed' })
  autoPrint!: boolean;

  @ApiProperty({ description: 'Receipt paper width' })
  paperWidth!: string;
}
