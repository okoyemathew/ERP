import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { CreateExpenseDto } from '../expenses/dto/create-expense.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSaleDto } from '../sales/dto/create-sale.dto';
import { SalesService } from '../sales/sales.service';
import { SyncBatchDto, SyncOperationDto } from './dto/sync-operation.dto';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly expensesService: ExpensesService,
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
            ...(operation.payload as CreateSaleDto),
            deviceId:
              operation.deviceId ??
              (operation.payload as CreateSaleDto).deviceId,
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

      if (operation.type === 'EXPENSE_CREATE') {
        const existing = await this.prisma.expense.findFirst({
          where: { businessId, receiptNumber: operation.operationId },
          select: { id: true, expenseNumber: true, syncVersion: true },
        });

        if (existing) {
          return {
            operationId: operation.operationId,
            type: operation.type,
            status: 'DUPLICATE_CONFIRMED',
            entity: 'Expense',
            entityId: existing.id,
            syncVersion: existing.syncVersion,
          };
        }

        const expensePayload = operation.payload as CreateExpenseDto;
        const expense = await this.expensesService.createExpense(
          businessId,
          {
            ...expensePayload,
            deviceId: operation.deviceId ?? expensePayload.deviceId,
            receiptNumber: operation.operationId,
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
            description: `Synchronized offline expense ${expense.expenseNumber}`,
            deviceId: operation.deviceId ?? expensePayload.deviceId ?? null,
          },
        });

        return {
          operationId: operation.operationId,
          type: operation.type,
          status: 'SYNCED',
          entity: 'Expense',
          entityId: expense.id,
          syncVersion: 1,
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
