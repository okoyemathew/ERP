import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdjustmentType,
  AuditAction,
  CreditSaleStatus,
  InventoryTransactionType,
  NotificationType,
  Prisma,
  ProductReturnRequestStatus,
  SaleStatus,
} from '@prisma/client';
import {
  ADMIN_ROLE_NAMES,
  SYSTEM_ROLES,
  normalizeSystemRoleName,
} from '../auth/constants/roles.constant';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductReturnRequestDto } from './dto/create-product-return-request.dto';
import { InventoryHistoryQueryDto } from './dto/inventory-history-query.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { ProductReturnRequestDecisionDto } from './dto/product-return-request-decision.dto';
import { ProductReturnRequestQueryDto } from './dto/product-return-request-query.dto';
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

  async createReturnRequest(
    businessId: string,
    dto: CreateProductReturnRequestDto,
    user: AuthenticatedUser,
  ) {
    await this.assertInventoryContext(businessId, dto.productId);
    this.validateDelta(
      dto.quantity,
      'Return quantity must be greater than zero.',
      true,
      dto.quantity,
    );

    return this.prisma.$transaction(async (tx) => {
      const saleItem = await this.getReturnableSaleItemOrThrow(
        businessId,
        dto,
        tx,
      );

      if (saleItem.sale.userId !== user.id) {
        throw new ForbiddenException(
          'Only the original seller can initiate this product return',
        );
      }

      const returned = await tx.productReturnRequest.aggregate({
        where: {
          businessId,
          saleItemId: saleItem.id,
          status: {
            in: [
              ProductReturnRequestStatus.PENDING,
              ProductReturnRequestStatus.APPROVED,
            ],
          },
        },
        _sum: { quantity: true },
      });
      const remainingReturnable =
        saleItem.quantity - (returned._sum.quantity ?? 0);

      if (dto.quantity > remainingReturnable) {
        throw new BadRequestException(
          `Only ${Math.max(0, remainingReturnable)} unit(s) remain returnable for this sale item`,
        );
      }

      const request = await tx.productReturnRequest.create({
        data: {
          businessId,
          productId: saleItem.productId,
          saleId: saleItem.saleId,
          saleItemId: saleItem.id,
          creditSaleId: saleItem.sale.creditSale?.id ?? null,
          customerId: saleItem.sale.customerId,
          originalSellerId: saleItem.sale.userId,
          requestedById: user.id,
          quantity: dto.quantity,
          unitCost: dto.unitCost ?? saleItem.unitPrice,
          referenceNumber: dto.referenceNumber ?? saleItem.sale.saleNumber,
          remarks: dto.remarks ?? null,
          status: ProductReturnRequestStatus.PENDING,
        },
        include: this.returnRequestInclude(),
      });

      if (!this.isOwnerUser(saleItem.sale.user)) {
        await this.notifyOwnersOfReturnRequest(businessId, request, tx);
      }

      await tx.auditLog.create({
        data: {
          businessId,
          userId: user.id,
          action: AuditAction.CREATE,
          entity: 'ProductReturnRequest',
          entityId: request.id,
          description: `Requested return of ${dto.quantity} unit(s) for ${saleItem.product.name} from sale ${saleItem.sale.saleNumber}`,
          deviceId: dto.deviceId ?? null,
        },
      });

      return request;
    });
  }

  async findReturnRequests(
    businessId: string,
    query: ProductReturnRequestQueryDto = {},
    user: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const accessWhere: Prisma.ProductReturnRequestWhereInput =
      this.canViewAllReturnRequests(user)
        ? query.requestedById
          ? { requestedById: query.requestedById }
          : {}
        : {
            OR: [{ requestedById: user.id }, { originalSellerId: user.id }],
          };
    const where: Prisma.ProductReturnRequestWhereInput = {
      businessId,
      ...(Object.keys(accessWhere).length ? { AND: [accessWhere] } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.startDate || query.endDate
        ? {
            requestedAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { referenceNumber: { contains: search, mode: 'insensitive' } },
              { remarks: { contains: search, mode: 'insensitive' } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { sku: { contains: search, mode: 'insensitive' } } },
              {
                requestedBy: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
              {
                requestedBy: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                requestedBy: {
                  lastName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                originalSeller: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
              {
                originalSeller: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                originalSeller: {
                  lastName: { contains: search, mode: 'insensitive' },
                },
              },
              { sale: { saleNumber: { contains: search, mode: 'insensitive' } } },
              {
                customer: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                customer: {
                  lastName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                customer: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                customer: {
                  phone: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.productReturnRequest.count({ where }),
      this.prisma.productReturnRequest.findMany({
        where,
        include: this.returnRequestInclude(),
        orderBy: { requestedAt: 'desc' },
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

  async approveReturnRequest(
    businessId: string,
    id: string,
    dto: ProductReturnRequestDecisionDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanReviewReturnRequests(user);

    return this.prisma.$transaction(async (tx) => {
      const request = await this.getPendingReturnRequestOrThrow(
        businessId,
        id,
        tx,
      );
      const transaction = this.shouldReturnToMainInventory(request)
        ? await this.applyApprovedReturnToMainInventory(
            businessId,
            request,
            dto,
            tx,
          )
        : null;

      await this.applyCreditReturnAdjustment(businessId, request, dto, tx);

      if (request.saleId) {
        await tx.sale.update({
          where: { id: request.saleId },
          data: { status: SaleStatus.REFUNDED },
        });
      }

      const updated = await tx.productReturnRequest.update({
        where: { id: request.id },
        data: {
          status: ProductReturnRequestStatus.APPROVED,
          reviewedById: user.id,
          reviewedAt: new Date(),
          decisionNote: dto.note ?? null,
          inventoryTransactionId: transaction?.id ?? null,
        },
        include: this.returnRequestInclude(),
      });

      if (request.requestedById !== user.id) {
        await tx.notification.create({
          data: {
            businessId,
            userId: request.requestedById,
            title: 'Return approved',
            message: `Return request for ${request.product.name} from ${request.sale?.saleNumber ?? request.referenceNumber ?? request.id} was approved.`,
            type: NotificationType.SUCCESS,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          businessId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entity: 'ProductReturnRequest',
          entityId: request.id,
          description: `Approved return request ${request.id}`,
          deviceId: dto.deviceId ?? null,
        },
      });

      return updated;
    });
  }

  async rejectReturnRequest(
    businessId: string,
    id: string,
    dto: ProductReturnRequestDecisionDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanReviewReturnRequests(user);

    return this.prisma.$transaction(async (tx) => {
      const request = await this.getPendingReturnRequestOrThrow(
        businessId,
        id,
        tx,
      );
      const updated = await tx.productReturnRequest.update({
        where: { id: request.id },
        data: {
          status: ProductReturnRequestStatus.REJECTED,
          reviewedById: user.id,
          reviewedAt: new Date(),
          decisionNote: dto.note ?? null,
        },
        include: this.returnRequestInclude(),
      });

      if (request.requestedById !== user.id) {
        await tx.notification.create({
          data: {
            businessId,
            userId: request.requestedById,
            title: 'Return rejected',
            message: `Return request for ${request.product.name} from ${request.sale?.saleNumber ?? request.referenceNumber ?? request.id} was rejected.`,
            type: NotificationType.WARNING,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          businessId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entity: 'ProductReturnRequest',
          entityId: request.id,
          description: `Rejected return request ${request.id}`,
          deviceId: dto.deviceId ?? null,
        },
      });

      return updated;
    });
  }

  private async getReturnableSaleItemOrThrow(
    businessId: string,
    dto: CreateProductReturnRequestDto,
    tx: Prisma.TransactionClient,
  ) {
    const saleItem = await tx.saleItem.findFirst({
      where: {
        id: dto.saleItemId,
        productId: dto.productId,
        sale: {
          businessId,
          deletedAt: null,
          status: { in: [SaleStatus.COMPLETED, SaleStatus.REFUNDED] },
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        sale: {
          include: {
            creditSale: true,
            customer: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
                role: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!saleItem) {
      throw new NotFoundException(
        'Completed sale item not found for this product return',
      );
    }

    return saleItem;
  }

  private shouldReturnToMainInventory(
    request: Prisma.ProductReturnRequestGetPayload<{
      include: ReturnType<InventoryService['returnRequestInclude']>;
    }>,
  ) {
    return !request.originalSellerId || this.isOwnerUser(request.originalSeller);
  }

  private async applyApprovedReturnToMainInventory(
    businessId: string,
    request: Prisma.ProductReturnRequestGetPayload<{
      include: ReturnType<InventoryService['returnRequestInclude']>;
    }>,
    dto: ProductReturnRequestDecisionDto,
    tx: Prisma.TransactionClient,
  ) {
    const inventory = await tx.inventory.findFirst({
      where: { businessId, productId: request.productId },
    });

    if (!inventory) {
      throw new NotFoundException(
        'Inventory record not found for this product',
      );
    }

    const quantityBefore = inventory.quantityAvailable;
    const quantityAfter = quantityBefore + request.quantity;
    const updatedInventory = await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        quantityOnHand: inventory.quantityOnHand + request.quantity,
        quantityReserved: inventory.quantityReserved,
        quantityAvailable: quantityAfter,
        lastStockUpdate: new Date(),
        averageCost: request.unitCost ?? inventory.averageCost ?? null,
        syncVersion: (inventory.syncVersion ?? 1) + 1,
        isSynced: true,
        deviceId: dto.deviceId ?? inventory.deviceId,
      },
    });

    return this.inventoryTransactionService.createTransaction(
      {
        businessId,
        inventoryId: updatedInventory.id,
        productId: request.productId,
        transactionType: InventoryTransactionType.RETURN,
        quantity: request.quantity,
        quantityBefore,
        quantityAfter,
        unitCost: request.unitCost ? request.unitCost.toNumber() : null,
        referenceNumber: request.referenceNumber ?? `RETURN:${request.id}`,
        remarks: request.remarks ?? 'Approved returned stock',
        transactionDate: new Date(),
        deviceId: dto.deviceId ?? null,
      },
      tx,
    );
  }

  private async applyCreditReturnAdjustment(
    businessId: string,
    request: Prisma.ProductReturnRequestGetPayload<{
      include: ReturnType<InventoryService['returnRequestInclude']>;
    }>,
    dto: ProductReturnRequestDecisionDto,
    tx: Prisma.TransactionClient,
  ) {
    if (!request.creditSale) {
      return;
    }

    const unitValue = new Prisma.Decimal(
      request.unitCost ?? request.saleItem?.unitPrice ?? 0,
    );
    const returnValue = unitValue.mul(request.quantity);

    if (returnValue.lte(0)) {
      return;
    }

    const currentBalance = new Prisma.Decimal(request.creditSale.balance);
    if (currentBalance.lte(0)) {
      return;
    }

    const adjustment = Prisma.Decimal.min(returnValue, currentBalance);
    const nextBalance = currentBalance.sub(adjustment);
    const nextTotalCredit = Prisma.Decimal.max(
      new Prisma.Decimal(request.creditSale.amountPaid),
      new Prisma.Decimal(request.creditSale.totalCredit).sub(adjustment),
    );

    await tx.creditSale.update({
      where: { id: request.creditSale.id },
      data: {
        totalCredit: nextTotalCredit,
        balance: nextBalance,
        status: this.creditStatus(
          nextTotalCredit,
          new Prisma.Decimal(request.creditSale.amountPaid),
          request.creditSale.dueDate,
        ),
      },
    });

    if (request.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: request.customerId, businessId },
        select: { outstandingBalance: true },
      });

      if (customer) {
        await tx.customer.update({
          where: { id: request.customerId },
          data: {
            outstandingBalance: Prisma.Decimal.max(
              new Prisma.Decimal(0),
              new Prisma.Decimal(customer.outstandingBalance).sub(adjustment),
            ),
            isSynced: true,
            syncVersion: { increment: 1 },
            deviceId: dto.deviceId ?? undefined,
          },
        });
      }
    }
  }

  private creditStatus(
    totalCredit: Prisma.Decimal,
    amountPaid: Prisma.Decimal,
    dueDate?: Date | null,
  ) {
    const balance = totalCredit.sub(amountPaid);

    if (balance.lte(0)) {
      return CreditSaleStatus.PAID;
    }

    if (dueDate && dueDate.getTime() < Date.now()) {
      return CreditSaleStatus.DEFAULTED;
    }

    if (amountPaid.gt(0)) {
      return CreditSaleStatus.PARTIALLY_PAID;
    }

    return CreditSaleStatus.ACTIVE;
  }

  private async notifyOwnersOfReturnRequest(
    businessId: string,
    request: Prisma.ProductReturnRequestGetPayload<{
      include: ReturnType<InventoryService['returnRequestInclude']>;
    }>,
    tx: Prisma.TransactionClient,
  ) {
    const owners = await tx.user.findMany({
      where: {
        businessId,
        role: { name: { in: [...ADMIN_ROLE_NAMES] } },
      },
      select: { id: true },
    });

    if (owners.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: owners.map((owner) => ({
        businessId,
        userId: owner.id,
        title: 'Return approval needed',
        message: `${this.userName(request.requestedBy)} requested return approval for ${request.product.name} from ${request.sale?.saleNumber ?? request.referenceNumber ?? request.id}.`,
        type: NotificationType.INFO,
      })),
    });
  }

  private userName(user: {
    firstName: string;
    lastName: string;
    username: string;
  }) {
    return `${user.firstName} ${user.lastName}`.trim() || user.username;
  }

  private isOwnerUser(
    user:
      | {
          role?: { name: string } | null;
        }
      | null
      | undefined,
  ) {
    return normalizeSystemRoleName(user?.role?.name) === SYSTEM_ROLES.OWNER;
  }

  private returnRequestInclude() {
    return {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
      originalSeller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          role: { select: { name: true } },
        },
      },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          phone: true,
        },
      },
      sale: {
        select: {
          id: true,
          saleNumber: true,
          saleDate: true,
          customerId: true,
          userId: true,
        },
      },
      saleItem: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          totalAmount: true,
        },
      },
      creditSale: {
        select: {
          id: true,
          totalCredit: true,
          amountPaid: true,
          balance: true,
          dueDate: true,
          status: true,
        },
      },
    } satisfies Prisma.ProductReturnRequestInclude;
  }

  private async getPendingReturnRequestOrThrow(
    businessId: string,
    id: string,
    tx: Prisma.TransactionClient,
  ) {
    const request = await tx.productReturnRequest.findFirst({
      where: {
        id,
        businessId,
        status: ProductReturnRequestStatus.PENDING,
      },
      include: this.returnRequestInclude(),
    });

    if (!request) {
      throw new NotFoundException('Pending return request not found');
    }

    return request;
  }

  private assertCanReviewReturnRequests(user: AuthenticatedUser) {
    if (!this.canViewAllReturnRequests(user)) {
      throw new ForbiddenException(
        'Only the business owner or admin can approve returned products',
      );
    }
  }

  private canViewAllReturnRequests(user: AuthenticatedUser) {
    const roleName = normalizeSystemRoleName(user.roleName);
    return roleName ? ADMIN_ROLE_NAMES.includes(roleName) : false;
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
