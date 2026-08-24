import { ApiProperty } from '@nestjs/swagger';

export class BusinessSettingsDto {
  @ApiProperty({ description: 'Currency code for the business' })
  currency!: string;

  @ApiProperty({ description: 'Timezone for the business' })
  timezone!: string;

  @ApiProperty({ description: 'Language locale for the business' })
  language!: string;

  @ApiProperty({ description: 'Whether negative stock is allowed' })
  allowNegativeStock!: boolean;

  @ApiProperty({ description: 'Whether credit sales are allowed' })
  allowCreditSales!: boolean;

  @ApiProperty({ description: 'Whether offline mode is enabled' })
  enableOfflineMode!: boolean;
}
