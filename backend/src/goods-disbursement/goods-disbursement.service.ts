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
      where: { id, businessId },
      include: this.include(),
    });

    if (!disbursement) {
      throw new NotFoundException('Goods disbursement not found');
    }

    return disbursement;
  }

  private buildWhere(
    businessId: string,
    query: GoodsDisbursementQueryDto,
    search?: string,
  ): Prisma.GoodsDisbursementWhereInput {
    return {
      businessId,
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
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
            },
          },
        },
      },
    } satisfies Prisma.GoodsDisbursementInclude;
  }
}
