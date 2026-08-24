import { ApiProperty } from '@nestjs/swagger';

export class BusinessConfigDto {
  @ApiProperty({ type: Object, description: 'Business profile details' })
  business!: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'Business settings details' })
  settings!: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'Receipt configuration settings' })
  receiptSettings!: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'Tax configuration settings' })
  taxSettings!: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    description: 'Notification configuration settings',
  })
  notificationSettings!: Record<string, unknown>;
}
