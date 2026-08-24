import { ApiProperty } from '@nestjs/swagger';

export class AuditLogDto {
  @ApiProperty({ description: 'Audit entry identifier' })
  id!: string;

  @ApiProperty({ description: 'Audit action performed' })
  action!: string;

  @ApiProperty({ description: 'Entity affected by the action' })
  entity!: string;

  @ApiProperty({ description: 'Identifier for the affected entity' })
  entityId?: string | null;

  @ApiProperty({ description: 'Description of the audit event' })
  description?: string | null;

  @ApiProperty({ description: 'User who performed the action' })
  userId?: string | null;

  @ApiProperty({ description: 'IP address associated with the audit event' })
  ipAddress?: string | null;

  @ApiProperty({
    description: 'Device identifier associated with the audit event',
  })
  deviceId?: string | null;

  @ApiProperty({ description: 'When the audit event was created' })
  createdAt!: Date;
}
