import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, InventoryTransactionType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoodsDisbursementDto } from './dto/create-goods-disbursement.dto';
import { GoodsDisbursementQueryDto } from './dto/goods-disbursement-query.dto';
import { UpdateGoodsDisbursementDto } from './dto/update-goods-disbursement.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class GoodsDisbursementService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    dto: CreateGoodsDisbursementDto,
    user: AuthenticatedUser,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one item is required');
    }

    const disbursementNumber =
      dto.disbursementNumber?.trim() ||
      `GD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const duplicate = await this.prisma.goodsDisbursement.findFirst({
      where: { businessId, disbursementNumber },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Disbursement number already exists');
    }

    const productIds = Array.from(
      new Set(dto.items.map((item) => item.productId)),
    );
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: productIds }, isActive: true },
      select: { id: true, name: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products were not found in this business',
      );
    }

    const employee = dto.employeeId
      ? await this.prisma.employee.findFirst({
          where: { id: dto.employeeId, businessId, deletedAt: null },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            user: { select: { username: true } },
          },
        })
      : null;

    if (dto.employeeId && !employee) {
      throw new BadRequestException(
        'Employee recipient was not found in this business',
      );
    }

    const employeeDisplayName = employee
      ? `${employee.firstName} ${employee.lastName}`.trim() ||
        employee.user.username ||
        employee.employeeCode
      : null;
    const destination = dto.destination?.trim() || employeeDisplayName || null;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.goodsDisbursement.create({
        data: {
          businessId,
          employeeId: employee?.id ?? null,
          disbursementNumber,
          disbursementDate: dto.disbursementDate
            ? new Date(dto.disbursementDate)
            : new Date(),
          destination,
          remarks: dto.remarks?.trim() || null,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              remarks: item.remarks?.trim() || null,
            })),
          },
        },
        include: this.include(),
      });

      for (const item of dto.items) {
        await this.applyStockOut(tx, businessId, {
          productId: item.productId,
          quantity: item.quantity,
          referenceNumber: disbursementNumber,
          remarks: item.remarks ?? `Goods disbursement ${disbursementNumber}`,
          deviceId: dto.deviceId,
        });
      }

      await tx.auditLog.create({
        data: {
          businessId,
          userId: user.id,
          action: AuditAction.CREATE,
          entity: 'GoodsDisbursement',
          entityId: created.id,
          description: `Created goods disbursement ${disbursementNumber}`,
          deviceId: dto.deviceId ?? null,
        },
      });

      return created;
    });
  }

  async findAll(businessId: string, query: GoodsDisbursementQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'disbursementDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const search = query.search?.trim();
    const where = this.buildWhere(businessId, query, search);

    const [total, data] = await Promise.all([
      this.prisma.goodsDisbursement.count({ where }),
      this.prisma.goodsDisbursement.findMany({
        where,
        include: this.include(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(businessId: string, id: string) {
    const disbursement = await this.prisma.goodsDisbursement.findFirst({
      where: { id, businessId, items: { some: { product: { isActive: true } } } },
      include: this.include(),
    });

    if (!disbursement) {
      throw new NotFoundException('Goods disbursement not found');
    }

    return disbursement;
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateGoodsDisbursementDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.prisma.goodsDisbursement.findFirst({
      where: { id, businessId },
      include: { items: { where: { product: { isActive: true } } } },
    });

    if (!current) {
      throw new NotFoundException('Goods disbursement not found');
    }

    const disbursementNumber =
      dto.disbursementNumber?.trim() || current.disbursementNumber;
    if (disbursementNumber !== current.disbursementNumber) {
      const duplicate = await this.prisma.goodsDisbursement.findFirst({
        where: { businessId, disbursementNumber, id: { not: id } },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('Disbursement number already exists');
      }
    }

    const employee = dto.employeeId
      ? await this.prisma.employee.findFirst({
          where: { id: dto.employeeId, businessId, deletedAt: null },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            user: { select: { username: true } },
          },
        })
      : undefined;

    if (dto.employeeId && !employee) {
      throw new BadRequestException(
        'Employee recipient was not found in this business',
      );
    }

    if (dto.items && dto.items.length === 0) {
      throw new BadRequestException('At least one item is required');
    }

    if (dto.items?.length) {
      await this.ensureProductsExist(
        businessId,
        dto.items.map((item) => item.productId),
      );
    }

    const employeeDisplayName = employee
      ? `${employee.firstName} ${employee.lastName}`.trim() ||
        employee.user.username ||
        employee.employeeCode
      : undefined;
    const destination =
      dto.destination !== undefined
        ? dto.destination.trim() || employeeDisplayName || null
        : employeeDisplayName || current.destination;

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await this.applyDisbursementItemDelta(tx, businessId, {
          currentItems: current.items,
          nextItems: dto.items,
          referenceNumber: disbursementNumber,
          deviceId: dto.deviceId,
        });

        await tx.goodsDisbursementItem.deleteMany({
          where: { goodsDisbursementId: id },
        });
        await tx.goodsDisbursementItem.createMany({
          data: dto.items.map((item) => ({
            goodsDisbursementId: id,
            productId: item.productId,
            quantity: item.quantity,
            remarks: item.remarks?.trim() || null,
          })),
        });
      }

      await tx.goodsDisbursement.update({
        where: { id },
        data: {
          employeeId:
            dto.employeeId !== undefined ? (employee?.id ?? null) : undefined,
          disbursementNumber,
          disbursementDate: dto.disbursementDate
            ? new Date(dto.disbursementDate)
            : undefined,
          destination,
          remarks:
            dto.remarks !== undefined ? dto.remarks.trim() || null : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          businessId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entity: 'GoodsDisbursement',
          entityId: id,
          description: `Updated goods disbursement ${disbursementNumber}`,
          deviceId: dto.deviceId ?? null,
        },
      });

      const updated = await tx.goodsDisbursement.findFirst({
        where: { id, businessId, items: { some: { product: { isActive: true } } } },
        include: this.include(),
      });

      if (!updated) {
        throw new NotFoundException('Goods disbursement not found');
      }

      return updated;
    });
  }

  private buildWhere(
    businessId: string,
    query: GoodsDisbursementQueryDto,
    search?: string,
  ): Prisma.GoodsDisbursementWhereInput {
    return {
      businessId,
      items: { some: { product: { isActive: true } } },
      ...(query.startDate || query.endDate
        ? {
            disbursementDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(search
        ? {
            OR: [
              {
                disbursementNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                destination: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                items: {
                  some: {
                    product: {
                      name: {
                        contains: search,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async applyStockOut(
    tx: Tx,
    businessId: string,
    data: {
      productId: string;
      quantity: number;
      referenceNumber: string;
      remarks?: string;
      deviceId?: string;
    },
  ) {
    const inventory = await tx.inventory.findFirst({
      where: { businessId, productId: data.productId, deletedAt: null },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    const settings = await tx.businessSettings.findUnique({
      where: { businessId },
      select: { allowNegativeStock: true },
    });
    const quantityAfter = inventory.quantityAvailable - data.quantity;

    if (!settings?.allowNegativeStock && quantityAfter < 0) {
      throw new BadRequestException(
        'Negative stock is not allowed for this business setting.',
      );
    }

    const updated = await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        quantityOnHand: inventory.quantityOnHand - data.quantity,
        quantityAvailable: quantityAfter,
        lastStockUpdate: new Date(),
        syncVersion: { increment: 1 },
        isSynced: true,
        deviceId: data.deviceId ?? undefined,
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        businessId,
        inventoryId: updated.id,
        productId: data.productId,
        transactionType: InventoryTransactionType.STOCK_OUT,
        quantity: data.quantity,
        quantityBefore: inventory.quantityAvailable,
        quantityAfter,
        referenceNumber: data.referenceNumber,
        remarks: data.remarks ?? null,
        transactionDate: new Date(),
        deviceId: data.deviceId ?? null,
        isSynced: true,
        syncVersion: 1,
      },
    });
  }

  private async applyStockIn(
    tx: Tx,
    businessId: string,
    data: {
      productId: string;
      quantity: number;
      referenceNumber: string;
      remarks?: string;
      deviceId?: string;
    },
  ) {
    const inventory = await tx.inventory.findFirst({
      where: { businessId, productId: data.productId, deletedAt: null },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    const quantityAfter = inventory.quantityAvailable + data.quantity;
    const updated = await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        quantityOnHand: inventory.quantityOnHand + data.quantity,
        quantityAvailable: quantityAfter,
        lastStockUpdate: new Date(),
        syncVersion: { increment: 1 },
        isSynced: true,
        deviceId: data.deviceId ?? undefined,
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        businessId,
        inventoryId: updated.id,
        productId: data.productId,
        transactionType: InventoryTransactionType.STOCK_IN,
        quantity: data.quantity,
        quantityBefore: inventory.quantityAvailable,
        quantityAfter,
        referenceNumber: data.referenceNumber,
        remarks: data.remarks ?? null,
        transactionDate: new Date(),
        deviceId: data.deviceId ?? null,
        isSynced: true,
        syncVersion: 1,
      },
    });
  }

  private async applyDisbursementItemDelta(
    tx: Tx,
    businessId: string,
    data: {
      currentItems: Array<{ productId: string; quantity: number }>;
      nextItems: Array<{ productId: string; quantity: number; remarks?: string }>;
      referenceNumber: string;
      deviceId?: string;
    },
  ) {
    const currentByProduct = this.sumItemsByProduct(data.currentItems);
    const nextByProduct = this.sumItemsByProduct(data.nextItems);
    const productIds = new Set([
      ...currentByProduct.keys(),
      ...nextByProduct.keys(),
    ]);

    for (const productId of productIds) {
      const currentQuantity = currentByProduct.get(productId) ?? 0;
      const nextQuantity = nextByProduct.get(productId) ?? 0;
      const delta = nextQuantity - currentQuantity;

      if (delta > 0) {
        await this.applyStockOut(tx, businessId, {
          productId,
          quantity: delta,
          referenceNumber: data.referenceNumber,
          remarks: `Updated goods disbursement ${data.referenceNumber}`,
          deviceId: data.deviceId,
        });
      }

      if (delta < 0) {
        await this.applyStockIn(tx, businessId, {
          productId,
          quantity: Math.abs(delta),
          referenceNumber: data.referenceNumber,
          remarks: `Reduced goods disbursement ${data.referenceNumber}`,
          deviceId: data.deviceId,
        });
      }
    }
  }

  private sumItemsByProduct(
    items: Array<{ productId: string; quantity: number }>,
  ) {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    }
    return quantities;
  }

  private async ensureProductsExist(businessId: string, productIds: string[]) {
    const uniqueProductIds = Array.from(new Set(productIds));
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: uniqueProductIds }, isActive: true },
      select: { id: true },
    });

    if (products.length !== uniqueProductIds.length) {
      throw new BadRequestException(
        'One or more products were not found in this business',
      );
    }
  }

  private include() {
    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          user: { select: { username: true } },
        },
      },
      items: {
        where: { product: { isActive: true } },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              sellingPrice: true,
              isActive: true,
            },
          },
        },
      },
    } satisfies Prisma.GoodsDisbursementInclude;
  }
}
