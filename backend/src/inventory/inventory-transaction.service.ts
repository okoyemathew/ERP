import { Injectable } from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async createTransaction(
    data: {
      businessId: string;
      inventoryId: string;
      productId: string;
      transactionType: InventoryTransactionType;
      quantity: number;
      quantityBefore: number;
      quantityAfter: number;
      unitCost?: number | null;
      referenceNumber?: string | null;
      remarks?: string | null;
      transactionDate?: Date;
      deviceId?: string | null;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.inventoryTransaction.create({
      data: {
        businessId: data.businessId,
        inventoryId: data.inventoryId,
        productId: data.productId,
        transactionType: data.transactionType,
        quantity: data.quantity,
        quantityBefore: data.quantityBefore,
        quantityAfter: data.quantityAfter,
        unitCost: data.unitCost ?? null,
        referenceNumber: data.referenceNumber ?? null,
        remarks: data.remarks ?? null,
        transactionDate: data.transactionDate ?? new Date(),
        deviceId: data.deviceId ?? null,
        isSynced: true,
        syncVersion: 1,
      },
    });
  }
}
