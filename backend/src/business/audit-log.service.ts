import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async recordAudit(data: {
    businessId: string;
    userId: string | null;
    action: AuditAction;
    entity: string;
    entityId?: string | null;
    description?: string | null;
    ipAddress?: string | null;
    deviceId?: string | null;
  }) {
    return this.prisma.auditLog.create({
      data: {
        businessId: data.businessId,
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        description: data.description,
        ipAddress: data.ipAddress,
        deviceId: data.deviceId,
      },
    });
  }

  async listAuditLogs(
    businessId: string,
    page = 1,
    limit = 20,
  ): Promise<{ total: number; page: number; limit: number; logs: any[] }> {
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where: { businessId } }),
      this.prisma.auditLog.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { total, page, limit, logs };
  }
}
