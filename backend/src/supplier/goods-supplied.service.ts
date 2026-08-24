import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, InventoryTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateGoodsSuppliedDto } from './dto/create-goods-supplied.dto';
import { GoodsSuppliedQueryDto } from './dto/goods-supplied-query.dto';
import { SupplierStatisticsDto } from './dto/supplier-statistics.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Injectable()
export class GoodsSuppliedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  private generateSupplyNumber(): string {
    return `GS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  async create(
    businessId: string,
    supplierId: string,
    dto: CreateGoodsSuppliedDto,
    user?: AuthenticatedUser,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item is required');
    }

    // Validate all products exist in the business
    const productIds = dto.items.map((item) => item.productId);
    const existingProducts = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        businessId,
      },
      select: { id: true },
    });

    if (existingProducts.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products not found in this business',
      );
    }

    const supplyNumber =
      dto.supplyNumber?.trim() || this.generateSupplyNumber();

    const existingSupply = await this.prisma.goodsSupplied.findFirst({
      where: {
        businessId,
        supplyNumber,
      },
    });

    if (existingSupply) {
      throw new BadRequestException('Supply number already exists');
    }

    const suppliedDate = dto.suppliedDate
      ? new Date(dto.suppliedDate)
      : new Date();

    // Calculate totals for items
    const items = dto.items.map((item) => {
      const unitCost = new Decimal(item.unitCost);
      const quantity = item.quantity;
      const totalCost = unitCost.mul(quantity);

      return {
        productId: item.productId,
        quantity,
        unitCost,
        totalCost,
      };
    });

    const totalCost = items.reduce(
      (sum, item) => sum.plus(item.totalCost),
      new Decimal(0),
    );

    // Execute transaction: create goods supplied, items, and update inventory atomically
    const goodsSupplied = await this.prisma.$transaction(async (tx) => {
      const newGoodsSupplied = await tx.goodsSupplied.create({
        data: {
          businessId,
          supplierId,
          supplyNumber,
          suppliedDate,
          remarks: dto.remarks?.trim() || null,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.totalCost,
            })),
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          supplier: true,
        },
      });

      // Stock in each item via inventory service
      for (const item of newGoodsSupplied.items) {
        await this.inventoryService.stockIn(
          businessId,
          {
            productId: item.productId,
            quantity: item.quantity,
            transactionType: InventoryTransactionType.STOCK_IN,
            referenceNumber: supplyNumber,
            remarks: `Received from supplier ${supplier.companyName}`,
            unitCost: item.unitCost.toNumber(),
            deviceId: undefined,
          },
          user,
        );
      }

      // Update supplier outstanding balance
      const newOutstandingBalance = supplier.outstandingBalance.plus(totalCost);
      await tx.supplier.update({
        where: { id: supplierId },
        data: {
          outstandingBalance: newOutstandingBalance,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          businessId,
          userId: user?.id ?? null,
          action: 'CREATE',
          entity: 'GoodsSupplied',
          entityId: newGoodsSupplied.id,
          description: `Created goods supply ${supplyNumber} from supplier ${supplier.companyName}`,
          deviceId: null,
        },
      });

      return newGoodsSupplied;
    });

    return goodsSupplied;
  }

  async findOne(businessId: string, id: string) {
    const goodsSupplied = await this.prisma.goodsSupplied.findFirst({
      where: { id, businessId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        supplier: true,
      },
    });

    if (!goodsSupplied) {
      throw new NotFoundException('Goods supplied record not found');
    }

    return goodsSupplied;
  }

  async findAll(businessId: string, query: GoodsSuppliedQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'suppliedDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const search = query.search?.trim();

    const where: Prisma.GoodsSuppliedWhereInput = {
      businessId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(search
        ? {
            OR: [
              { supplyNumber: { contains: search, mode: 'insensitive' } },
              {
                supplier: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.goodsSupplied.count({ where }),
      this.prisma.goodsSupplied.findMany({
        where,
        include: {
          items: {
            include: {
              product: true,
            },
          },
          supplier: true,
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

  async search(
    businessId: string,
    term: string,
    query: GoodsSuppliedQueryDto = {},
  ) {
    const search = term.trim();
    if (!search) {
      return this.findAll(businessId, query);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, items] = await Promise.all([
      this.prisma.goodsSupplied.count({
        where: {
          businessId,
          OR: [
            { supplyNumber: { contains: search, mode: 'insensitive' } },
            {
              supplier: {
                companyName: { contains: search, mode: 'insensitive' },
              },
            },
          ],
        },
      }),
      this.prisma.goodsSupplied.findMany({
        where: {
          businessId,
          OR: [
            { supplyNumber: { contains: search, mode: 'insensitive' } },
            {
              supplier: {
                companyName: { contains: search, mode: 'insensitive' },
              },
            },
          ],
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          supplier: true,
        },
        orderBy: { createdAt: 'desc' },
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

  async getSupplierPurchaseHistory(
    businessId: string,
    supplierId: string,
    query: GoodsSuppliedQueryDto = {},
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return this.findAll(businessId, { ...query, supplierId });
  }

  async getSupplierStatistics(
    businessId: string,
    supplierId: string,
  ): Promise<SupplierStatisticsDto> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const [
      totalPurchaseOrders,
      completedPurchaseOrders,
      activePurchaseOrders,
      totalGoodsSupplied,
      lastSupply,
    ] = await Promise.all([
      this.prisma.purchaseOrder.count({
        where: { supplierId, businessId },
      }),
      this.prisma.purchaseOrder.count({
        where: { supplierId, businessId, status: 'RECEIVED' },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          supplierId,
          businessId,
          status: { in: ['PENDING', 'APPROVED'] },
        },
      }),
      this.prisma.goodsSupplied.count({
        where: { supplierId, businessId },
      }),
      this.prisma.goodsSupplied.findFirst({
        where: { supplierId, businessId },
        orderBy: { suppliedDate: 'desc' },
        select: { suppliedDate: true },
      }),
    ]);

    // Calculate totals
    const goodsSupplies = await this.prisma.goodsSupplied.findMany({
      where: { supplierId, businessId },
      include: {
        items: true,
      },
    });

    const totalItemsReceived = goodsSupplies.reduce(
      (sum, gs) =>
        sum + gs.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );

    const totalAmountSpent = goodsSupplies.reduce(
      (sum, gs) =>
        sum.plus(
          gs.items.reduce(
            (itemSum, item) => itemSum.plus(item.totalCost),
            new Decimal(0),
          ),
        ),
      new Decimal(0),
    );

    const uniqueProducts = new Set(
      goodsSupplies.flatMap((gs) => gs.items.map((item) => item.productId)),
    );

    return {
      totalPurchaseOrders,
      completedPurchaseOrders,
      activePurchaseOrders,
      totalGoodsSupplied,
      totalItemsReceived,
      totalAmountSpent: totalAmountSpent.toNumber(),
      outstandingBalance: supplier.outstandingBalance.toNumber(),
      productsSupplied: uniqueProducts.size,
      lastSupplyDate: lastSupply?.suppliedDate,
    };
  }
}
