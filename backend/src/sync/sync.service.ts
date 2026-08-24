import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { SyncBatchDto, SyncOperationDto } from './dto/sync-operation.dto';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
  ) {}

  async sync(businessId: string, dto: SyncBatchDto, user: AuthenticatedUser) {
    const results = [];

    for (const operation of dto.operations) {
      results.push(await this.processOperation(businessId, operation, user));
    }

    return {
      serverTime: new Date(),
      results,
    };
  }

  private async processOperation(
    businessId: string,
    operation: SyncOperationDto,
    user: AuthenticatedUser,
  ) {
    try {
      if (operation.type === 'SALE_CREATE') {
        const existing = await this.prisma.sale.findFirst({
          where: { businessId, idempotencyKey: operation.operationId },
          select: { id: true, saleNumber: true, syncVersion: true },
        });

        if (existing) {
          return {
            operationId: operation.operationId,
            type: operation.type,
            status: 'DUPLICATE_CONFIRMED',
            entity: 'Sale',
            entityId: existing.id,
            syncVersion: existing.syncVersion,
          };
        }

        const sale = await this.salesService.create(
          businessId,
          {
            ...operation.payload,
            deviceId: operation.deviceId ?? operation.payload.deviceId,
            idempotencyKey: operation.operationId,
          },
          user,
        );

        await this.prisma.auditLog.create({
          data: {
            businessId,
            userId: user.id,
            action: AuditAction.CREATE,
            entity: 'SyncOperation',
            entityId: operation.operationId,
            description: `Synchronized offline sale ${sale.saleNumber}`,
            deviceId: operation.deviceId ?? operation.payload.deviceId ?? null,
          },
        });

        return {
          operationId: operation.operationId,
          type: operation.type,
          status: 'SYNCED',
          entity: 'Sale',
          entityId: sale.id,
          syncVersion: sale.syncVersion,
        };
      }

      return {
        operationId: operation.operationId,
        type: operation.type,
        status: 'FAILED',
        error: 'Unsupported sync operation type',
      };
    } catch (error) {
      return {
        operationId: operation.operationId,
        type: operation.type,
        status: 'FAILED',
        error:
          error instanceof Error
            ? error.message
            : 'Unable to synchronize operation',
      };
    }
  }
}
