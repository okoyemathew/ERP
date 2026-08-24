import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdjustmentType,
  AuditAction,
  InventoryTransactionType,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryHistoryQueryDto } from './dto/inventory-history-query.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { StockAdjustmentQueryDto } from './dto/stock-adjustment-query.dto';
import { StockMutationDto } from './dto/stock-mutation.dto';
import { StockAdjustmentRequestDto } from './dto/stock-adjustment-request.dto';
import { InventoryTransactionService } from './inventory-transaction.service';
import { StockAdjustmentService } from './stock-adjustment.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryTransactionService: InventoryTransactionService,
    private readonly stockAdjustmentService: StockAdjustmentService,
  ) {}

  async findAll(businessId: string, query: InventoryQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'lastStockUpdate';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.InventoryWhereInput = {
      businessId,
      deletedAt: null,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.sku
        ? {
            product: {
              sku: { contains: query.sku, mode: 'insensitive' },
            },
          }
        : {}),
      ...(query.barcode
        ? {
            product: {
              barcode: { contains: query.barcode, mode: 'insensitive' },
            },
          }
        : {}),
      ...(query.lowStock
        ? {
            quantityAvailable: { lte: query.reorderLevel ?? 0 },
          }
        : {}),
      ...(query.availableOnly ? { quantityAvailable: { gt: 0 } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.inventory.count({ where }),
      this.prisma.inventory.findMany({
        where,
        include: {
          product: {
            include: {
              category: true,
              brand: true,
              unit: true,
            },
          },
          transactions: {
            take: 5,
            orderBy: { transactionDate: 'desc' },
          },
          adjustments: {
            take: 5,
            orderBy: { adjustmentDate: 'desc' },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByProduct(businessId: string, productId: string) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { businessId, productId },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            unit: true,
          },
        },
        transactions: {
          orderBy: { transactionDate: 'desc' },
          take: 10,
        },
        adjustments: {
          orderBy: { adjustmentDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!inventory) {
      throw new NotFoundException(
        'Inventory record not found for this product',
      );
    }

    return inventory;
  }

  async searchBySku(businessId: string, sku: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        businessId,
        sku: { equals: sku, mode: 'insensitive' },
      },
      include: { inventory: true },
    });

    if (!product) {
      throw new NotFoundException('Product with matching SKU not found');
    }

    return product.inventory;
  }

  async searchByBarcode(businessId: string, barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        businessId,
        barcode: { equals: barcode, mode: 'insensitive' },
      },
      include: { inventory: true },
    });

    if (!product) {
      throw new NotFoundException('Product with matching barcode not found');
    }

    return product.inventory;
  }

  async getHistory(
    businessId: string,
    productId: string,
    query: InventoryHistoryQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, data] = await Promise.all([
      this.prisma.inventoryTransaction.count({
        where: { businessId, productId },
      }),
      this.prisma.inventoryTransaction.findMany({
        where: { businessId, productId },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdjustments(
    businessId: string,
    productId: string,
    query: StockAdjustmentQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, data] = await Promise.all([
      this.prisma.stockAdjustment.count({
        where: { businessId, productId },
      }),
      this.prisma.stockAdjustment.findMany({
        where: { businessId, productId },
        orderBy: { adjustmentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async assertInventoryContext(
    businessId: string,
    productId: string,
  ): Promise<
    Prisma.InventoryGetPayload<{
      include: { product: true };
    }>
  > {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const inventory = await this.prisma.inventory.findFirst({
      where: { businessId, productId },
      include: { product: true },
    });

    if (!inventory) {
      throw new NotFoundException(
        'Inventory record not found for this product',
      );
    }

    return inventory;
  }

  private validateDelta(
    quantity: number,
    positiveMessage: string,
    allowNegativeStock: boolean,
    quantityAfter: number,
  ) {
    if (quantity <= 0) {
      throw new BadRequestException(positiveMessage);
    }

    if (!allowNegativeStock && quantityAfter < 0) {
      throw new BadRequestException(
        'Negative stock is not allowed for this business setting.',
      );
    }
  }

  private getInventoryStatus(
    quantityAvailable: number,
    reorderLevel: number | null,
    minimumStock: number | null,
  ): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
    const threshold = reorderLevel ?? minimumStock ?? 0;

    if (quantityAvailable <= 0) {
      return 'OUT_OF_STOCK';
    }

    if (quantityAvailable <= threshold) {
      return 'LOW_STOCK';
    }

    return 'IN_STOCK';
  }

  private async applyInventoryMovement(
    businessId: string,
    productId: string,
    quantity: number,
    transactionType: InventoryTransactionType,
    options: {
      referenceNumber?: string | null;
      remarks?: string | null;
      unitCost?: number | null;
      deviceId?: string | null;
      reason?: string | null;
      adjustmentType?: AdjustmentType | null;
      approvedBy?: string | null;
      user?: AuthenticatedUser;
    } = {},
  ) {
    const inventory = await this.assertInventoryContext(businessId, productId);
    const settings = await this.prisma.businessSettings.findUnique({
      where: { businessId },
      select: { allowNegativeStock: true },
    });

    const quantityBefore = inventory.quantityAvailable;
    const quantityAfter =
      quantityBefore +
      (transactionType === InventoryTransactionType.STOCK_OUT ||
      transactionType === InventoryTransactionType.SALE ||
      transactionType === InventoryTransactionType.DAMAGE ||
      transactionType === InventoryTransactionType.EXPIRED
        ? -quantity
        : quantity);

    this.validateDelta(
      quantity,
      'Quantity must be greater than zero.',
      settings?.allowNegativeStock ?? false,
      quantityAfter,
    );

    return this.prisma.$transaction(async (tx) => {
      const currentInventory = await tx.inventory.findFirst({
        where: { businessId, productId },
      });

      if (!currentInventory) {
        throw new NotFoundException(
          'Inventory record not found for this product',
        );
      }

      const currentBefore = currentInventory.quantityAvailable;
      const nextAfter =
        currentBefore +
        (transactionType === InventoryTransactionType.STOCK_OUT ||
        transactionType === InventoryTransactionType.SALE ||
        transactionType === InventoryTransactionType.DAMAGE ||
        transactionType === InventoryTransactionType.EXPIRED
          ? -quantity
          : quantity);
      const allowNegative =
        (
          await tx.businessSettings.findUnique({
            where: { businessId },
            select: { allowNegativeStock: true },
          })
        )?.allowNegativeStock ?? false;

      if (!allowNegative && nextAfter < 0) {
        throw new BadRequestException(
          'Negative stock is not allowed for this business setting.',
        );
      }

      const updatedInventory = await tx.inventory.update({
        where: { id: currentInventory.id },
        data: {
          quantityOnHand:
            transactionType === InventoryTransactionType.STOCK_OUT ||
            transactionType === InventoryTransactionType.SALE ||
            transactionType === InventoryTransactionType.DAMAGE ||
            transactionType === InventoryTransactionType.EXPIRED
              ? currentInventory.quantityOnHand - quantity
              : currentInventory.quantityOnHand + quantity,
          quantityReserved: currentInventory.quantityReserved,
          quantityAvailable: nextAfter,
          lastStockUpdate: new Date(),
          averageCost: options.unitCost ?? currentInventory.averageCost ?? null,
          syncVersion: (currentInventory.syncVersion ?? 1) + 1,
          isSynced: true,
          deviceId: options.deviceId ?? currentInventory.deviceId,
        },
      });

      await this.inventoryTransactionService.createTransaction(
        {
          businessId,
          inventoryId: updatedInventory.id,
          productId,
          transactionType,
          quantity,
          quantityBefore: currentBefore,
          quantityAfter: nextAfter,
          unitCost: options.unitCost ?? null,
          referenceNumber: options.referenceNumber ?? null,
          remarks: options.remarks ?? null,
          transactionDate: new Date(),
          deviceId: options.deviceId ?? null,
        },
        tx,
      );

      if (options.adjustmentType) {
        await this.stockAdjustmentService.createAdjustment(
          {
            businessId,
            inventoryId: updatedInventory.id,
            productId,
            quantity:
              options.adjustmentType === AdjustmentType.INCREASE
                ? quantity
                : -quantity,
            previousQuantity: currentBefore,
            newQuantity: nextAfter,
            reason: options.reason ?? 'Stock adjustment',
            approvedBy: options.approvedBy ?? options.user?.username ?? null,
            adjustmentDate: new Date(),
            deviceId: options.deviceId ?? null,
          },
          tx,
        );
      }

      if (options.user) {
        await tx.auditLog.create({
          data: {
            businessId,
            userId: options.user.id,
            action: this.auditActionForMovement(transactionType),
            entity: 'Inventory',
            entityId: updatedInventory.id,
            description: `${transactionType} ${quantity} unit(s) for product ${productId}`,
            deviceId: options.deviceId ?? null,
          },
        });
      }

      return updatedInventory;
    });
  }

  private auditActionForMovement(
    transactionType: InventoryTransactionType,
  ): AuditAction {
    if (transactionType === InventoryTransactionType.STOCK_IN) {
      return AuditAction.STOCK_IN;
    }

    if (
      transactionType === InventoryTransactionType.STOCK_OUT ||
      transactionType === InventoryTransactionType.DAMAGE ||
      transactionType === InventoryTransactionType.EXPIRED
    ) {
      return AuditAction.STOCK_OUT;
    }

    if (transactionType === InventoryTransactionType.ADJUSTMENT) {
      return AuditAction.STOCK_ADJUSTMENT;
    }

    return AuditAction.UPDATE;
  }

  async stockIn(
    businessId: string,
    dto: StockMutationDto,
    user?: AuthenticatedUser,
  ) {
    return this.applyInventoryMovement(
      businessId,
      dto.productId,
      dto.quantity,
      InventoryTransactionType.STOCK_IN,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.remarks ?? 'Stock in',
        unitCost: dto.unitCost ?? null,
        deviceId: dto.deviceId ?? null,
        user,
      },
    );
  }

  async stockOut(
    businessId: string,
    dto: StockMutationDto,
    user?: AuthenticatedUser,
  ) {
    return this.applyInventoryMovement(
      businessId,
      dto.productId,
      dto.quantity,
      InventoryTransactionType.STOCK_OUT,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.remarks ?? 'Stock out',
        unitCost: dto.unitCost ?? null,
        deviceId: dto.deviceId ?? null,
        user,
      },
    );
  }

  async stockAdjustment(
    businessId: string,
    dto: StockAdjustmentRequestDto,
    user?: AuthenticatedUser,
  ) {
    return this.applyInventoryMovement(
      businessId,
      dto.productId,
      Math.abs(dto.quantity),
      InventoryTransactionType.ADJUSTMENT,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.reason,
        deviceId: dto.deviceId ?? null,
        reason: dto.reason,
        adjustmentType: dto.adjustmentType,
        approvedBy: dto.approvedBy ?? user?.username ?? null,
        user,
      },
    );
  }

  async createDamage(
    businessId: string,
    dto: StockMutationDto,
    user?: AuthenticatedUser,
  ) {
    return this.applyInventoryMovement(
      businessId,
      dto.productId,
      dto.quantity,
      InventoryTransactionType.DAMAGE,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.remarks ?? 'Damaged stock',
        unitCost: dto.unitCost ?? null,
        deviceId: dto.deviceId ?? null,
        user,
      },
    );
  }

  async createExpiredStock(
    businessId: string,
    dto: StockMutationDto,
    user?: AuthenticatedUser,
  ) {
    return this.applyInventoryMovement(
      businessId,
      dto.productId,
      dto.quantity,
      InventoryTransactionType.EXPIRED,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.remarks ?? 'Expired stock',
        unitCost: dto.unitCost ?? null,
        deviceId: dto.deviceId ?? null,
        user,
      },
    );
  }

  async stockReturn(
    businessId: string,
    dto: StockMutationDto,
    user?: AuthenticatedUser,
  ) {
    return this.applyInventoryMovement(
      businessId,
      dto.productId,
      dto.quantity,
      InventoryTransactionType.RETURN,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.remarks ?? 'Returned stock',
        unitCost: dto.unitCost ?? null,
        deviceId: dto.deviceId ?? null,
        user,
      },
    );
  }

  async getLowStockProducts(businessId: string) {
    const inventories = await this.prisma.inventory.findMany({
      where: { businessId },
      include: {
        product: true,
      },
    });

    return inventories
      .filter(
        (item) =>
          item.quantityAvailable <=
          (item.reorderLevel ?? item.product.minimumStock ?? 0),
      )
      .map((item) => ({
        product: item.product,
        sku: item.product.sku,
        barcode: item.product.barcode,
        currentQuantity: item.quantityAvailable,
        reorderLevel: item.reorderLevel ?? item.product.minimumStock ?? 0,
        status: this.getInventoryStatus(
          item.quantityAvailable,
          item.reorderLevel,
          item.product.minimumStock,
        ),
      }));
  }

  async getOutOfStockProducts(businessId: string) {
    const inventories = await this.prisma.inventory.findMany({
      where: { businessId },
      include: { product: true },
    });

    return inventories
      .filter((item) => item.quantityAvailable <= 0)
      .map((item) => ({
        product: item.product,
        sku: item.product.sku,
        barcode: item.product.barcode,
        currentQuantity: item.quantityAvailable,
        reorderLevel: item.reorderLevel ?? item.product.minimumStock ?? 0,
        status: this.getInventoryStatus(
          item.quantityAvailable,
          item.reorderLevel,
          item.product.minimumStock,
        ),
      }));
  }

  async searchInventory(businessId: string, query: string) {
    const searchTerm = query.trim();

    if (!searchTerm) {
      return this.findAll(businessId, { page: 1, limit: 20 });
    }

    return this.prisma.inventory.findMany({
      where: {
        businessId,
        OR: [
          { product: { sku: { contains: searchTerm, mode: 'insensitive' } } },
          {
            product: { barcode: { contains: searchTerm, mode: 'insensitive' } },
          },
          { product: { name: { contains: searchTerm, mode: 'insensitive' } } },
        ],
      },
      include: {
        product: true,
      },
      orderBy: { lastStockUpdate: 'desc' },
    });
  }

  async adjustStock(
    businessId: string,
    productId: string,
    dto: AdjustInventoryDto,
    user?: AuthenticatedUser,
  ) {
    const adjustment = dto.quantity;
    const transactionType =
      adjustment >= 0
        ? InventoryTransactionType.STOCK_IN
        : InventoryTransactionType.STOCK_OUT;
    return this.applyInventoryMovement(
      businessId,
      productId,
      Math.abs(adjustment),
      transactionType,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.remarks ?? 'Manual stock update',
        unitCost: dto.unitCost ?? null,
        deviceId: null,
        reason: dto.reason ?? 'Manual stock update',
        adjustmentType:
          adjustment >= 0 ? AdjustmentType.INCREASE : AdjustmentType.DECREASE,
        approvedBy: user?.username ?? null,
        user,
      },
    );
  }
}
