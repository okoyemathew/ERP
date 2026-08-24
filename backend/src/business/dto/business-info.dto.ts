import { ApiProperty } from '@nestjs/swagger';

export class BusinessInfoDto {
  @ApiProperty({ description: 'Business identifier' })
  id!: string;

  @ApiProperty({ description: 'Business name' })
  name!: string;

  @ApiProperty({ description: 'Business about text', required: false })
  about?: string | null;

  @ApiProperty({ description: 'Business email', required: false })
  email?: string | null;

  @ApiProperty({ description: 'Business phone', required: false })
  phone?: string | null;

  @ApiProperty({ description: 'Business address', required: false })
  address?: string | null;

  @ApiProperty({ description: 'Business city', required: false })
  city?: string | null;

  @ApiProperty({ description: 'Business state', required: false })
  state?: string | null;

  @ApiProperty({ description: 'Business country', required: false })
  country?: string | null;

  @ApiProperty({ description: 'Business postal code', required: false })
  postalCode?: string | null;

  @ApiProperty({ description: 'Business tax number', required: false })
  taxNumber?: string | null;

  @ApiProperty({ description: 'Business registration number', required: false })
  registrationNo?: string | null;

  @ApiProperty({ description: 'Business logo URL', required: false })
  logo?: string | null;

  @ApiProperty({ description: 'Business currency' })
  currency!: string;

  @ApiProperty({ description: 'Business timezone' })
  timezone!: string;
}
