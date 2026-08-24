import { ApiProperty } from '@nestjs/swagger';
import { AuditLogDto } from './audit-log.dto';

export class BusinessAuditLogPageDto {
  @ApiProperty({ description: 'Total number of audit records' })
  total!: number;

  @ApiProperty({ description: 'Current page number' })
  page!: number;

  @ApiProperty({ description: 'Number of records returned per page' })
  limit!: number;

  @ApiProperty({
    type: [AuditLogDto],
    description: 'Paginated list of audit records',
  })
  logs!: AuditLogDto[];
}
