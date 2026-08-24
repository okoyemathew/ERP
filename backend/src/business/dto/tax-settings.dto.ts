import { ApiProperty } from '@nestjs/swagger';

export class TaxSettingsDto {
  @ApiProperty({ description: 'Name of the tax' })
  taxName!: string;

  @ApiProperty({ description: 'Tax percentage rate' })
  taxPercentage!: number;

  @ApiProperty({ description: 'Tax identification number', required: false })
  taxNumber?: string | null;

  @ApiProperty({ description: 'Whether tax is enabled' })
  taxEnabled!: boolean;
}
