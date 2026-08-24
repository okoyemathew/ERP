import { Injectable } from '@nestjs/common';
import { AdjustmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StockAdjustmentService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdjustment(
    data: {
      businessId: string;
      inventoryId: string;
      productId: string;
      quantity: number;
      previousQuantity: number;
      newQuantity: number;
      reason: string;
      approvedBy?: string | null;
      adjustmentDate?: Date;
      deviceId?: string | null;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const adjustmentType: AdjustmentType =
      data.quantity >= 0 ? 'INCREASE' : 'DECREASE';

    return tx.stockAdjustment.create({
      data: {
        businessId: data.businessId,
        inventoryId: data.inventoryId,
        productId: data.productId,
        adjustmentType,
        quantity: Math.abs(data.quantity),
        previousQuantity: data.previousQuantity,
        newQuantity: data.newQuantity,
        reason: data.reason,
        approvedBy: data.approvedBy ?? null,
        adjustmentDate: data.adjustmentDate ?? new Date(),
        deviceId: data.deviceId ?? null,
        isSynced: true,
        syncVersion: 1,
      },
    });
  }
}
