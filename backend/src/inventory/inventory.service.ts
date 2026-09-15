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
  PaymentStatus,
  PaymentMethod,
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
    if (!Number.isSafeInteger(dto.quantity) || dto.quantity <= 0) {
      throw new BadRequestException(
        'Return quantity must be a positive whole number.',
      );
    }
    this.validateDelta(
      dto.quantity,
      'Return quantity must be greater than zero.',
      true,
      dto.quantity,
    );

    return this.prisma.$transaction(async (tx) => {
      // Serialize reservations for all lines of an invoice before reading totals.
      await tx.$queryRaw`SELECT s.id FROM "Sale" s JOIN "SaleItem" i ON i."saleId" = s.id WHERE i.id = ${dto.saleItemId}::uuid AND s."businessId" = ${businessId}::uuid FOR UPDATE OF s`;
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
          unitCost: saleItem.product.purchasePrice,
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
              {
                sale: { saleNumber: { contains: search, mode: 'insensitive' } },
              },
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
      const approved = await tx.productReturnRequest.aggregate({
        where: {
          businessId,
          saleItemId: request.saleItemId,
          status: ProductReturnRequestStatus.APPROVED,
        },
        _sum: { quantity: true },
      });
      if (
        request.saleItem &&
        (approved._sum.quantity ?? 0) + request.quantity >
          request.saleItem.quantity
      ) {
        throw new BadRequestException(
          'Return quantity exceeds the quantity remaining on this sale item',
        );
      }
      const returnValue = request.saleItem
        ? this.returnValue(
            request.saleItem,
            request.quantity,
            approved._sum.quantity ?? 0,
          )
        : new Prisma.Decimal(request.unitCost ?? 0).mul(request.quantity);
      const transaction = this.shouldReturnToMainInventory(request)
        ? await this.applyApprovedReturnToMainInventory(
            businessId,
            request,
            dto,
            tx,
          )
        : null;

      await this.applyCreditReturnAdjustment(
        businessId,
        request,
        dto,
        tx,
        returnValue,
      );

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

      if (request.saleId) {
        await this.recalculateSaleAfterApprovedReturns(
          businessId,
          request.saleId,
          dto,
          tx,
        );
        const items = await tx.saleItem.findMany({
          where: { saleId: request.saleId },
          include: {
            productReturnRequests: {
              where: { status: ProductReturnRequestStatus.APPROVED },
              select: { quantity: true },
            },
          },
        });
        const fullyReturned =
          items.length > 0 &&
          items.every(
            (item) =>
              item.productReturnRequests.reduce(
                (sum, row) => sum + row.quantity,
                0,
              ) >= item.quantity,
          );
        await tx.sale.update({
          where: { id: request.saleId },
          data: {
            status: fullyReturned ? SaleStatus.REFUNDED : SaleStatus.COMPLETED,
          },
        });
      }

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
          description: `Approved return ${request.id}: ${request.quantity} unit(s) of ${request.product.name}; return value ${returnValue.toFixed(2)}`,
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
    dto: { saleItemId: string; productId?: string },
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
            purchasePrice: true,
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
    // Owners and employees both hold personal supplied stock. Approved requests
    // are credited to originalSellerId by the seller-stock ledger.
    return !request.originalSellerId;
  }

  private async applyApprovedReturnToMainInventory(
    businessId: string,
    request: Prisma.ProductReturnRequestGetPayload<{
      include: ReturnType<InventoryService['returnRequestInclude']>;
    }>,
    dto: ProductReturnRequestDecisionDto,
    tx: Prisma.TransactionClient,
  ) {
    await tx.$queryRaw`SELECT id FROM "Inventory" WHERE "businessId" = ${businessId}::uuid AND "productId" = ${request.productId}::uuid FOR UPDATE`;
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
        averageCost: inventory.averageCost ?? request.unitCost ?? null,
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
    returnValue: Prisma.Decimal,
  ) {
    if (!request.creditSale) {
      return;
    }

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

    if (request.saleId) {
      const actuallyPaid = (request.sale?.payments ?? [])
        .filter((payment) => payment.paymentMethod !== PaymentMethod.CREDIT)
        .reduce(
          (sum, payment) => sum.add(payment.amount),
          new Prisma.Decimal(request.creditSale.amountPaid),
        );
      await tx.sale.update({
        where: { id: request.saleId },
        data: {
          amountPaid: actuallyPaid,
          balanceDue: nextBalance,
          paymentStatus: nextBalance.eq(0)
            ? PaymentStatus.PAID
            : actuallyPaid.gt(0)
              ? PaymentStatus.PARTIAL
              : PaymentStatus.UNPAID,
        },
      });
    }

    if (request.customerId) {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${request.customerId}::uuid AND "businessId" = ${businessId}::uuid FOR UPDATE`;
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

  private returnValue(
    item: { quantity: number; totalAmount: Prisma.Decimal },
    quantity: number,
    alreadyApproved: number,
  ) {
    // Allocate the saved sale-line total, including its discount and tax.
    // Cumulative rounding ensures multiple partial returns never exceed that total.
    const total = new Prisma.Decimal(item.totalAmount);
    return total
      .mul(alreadyApproved + quantity)
      .div(item.quantity)
      .toDecimalPlaces(2)
      .sub(total.mul(alreadyApproved).div(item.quantity).toDecimalPlaces(2));
  }

  private async recalculateSaleAfterApprovedReturns(
    businessId: string,
    saleId: string,
    dto: ProductReturnRequestDecisionDto,
    tx: Prisma.TransactionClient,
  ) {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId, deletedAt: null },
      include: {
        customer: { select: { id: true } },
        payments: { select: { amount: true, paymentMethod: true } },
        creditSale: { select: { id: true, dueDate: true } },
        items: {
          include: {
            productReturnRequests: {
              where: { status: ProductReturnRequestStatus.APPROVED },
              select: { quantity: true },
            },
          },
        },
      },
    });

    if (!sale) return;

    const totals = sale.items.reduce(
      (sum, item) => {
        const returnedQuantity = Math.min(
          item.quantity,
          item.productReturnRequests.reduce((qty, row) => qty + row.quantity, 0),
        );
        const netQuantity = Math.max(0, item.quantity - returnedQuantity);
        const ratio = item.quantity > 0
          ? new Prisma.Decimal(returnedQuantity).div(item.quantity)
          : new Prisma.Decimal(0);
        const returnedSubtotal = new Prisma.Decimal(item.unitPrice)
          .mul(returnedQuantity)
          .toDecimalPlaces(2);
        const returnedDiscount = new Prisma.Decimal(item.discountAmount)
          .mul(ratio)
          .toDecimalPlaces(2);
        const returnedTax = new Prisma.Decimal(item.taxAmount)
          .mul(ratio)
          .toDecimalPlaces(2);
        const returnedTotal = new Prisma.Decimal(item.totalAmount)
          .mul(ratio)
          .toDecimalPlaces(2);

        return {
          subtotal: sum.subtotal.add(
            new Prisma.Decimal(item.unitPrice).mul(netQuantity),
          ),
          discountAmount: sum.discountAmount.add(
            Prisma.Decimal.max(
              new Prisma.Decimal(0),
              new Prisma.Decimal(item.discountAmount).sub(returnedDiscount),
            ),
          ),
          taxAmount: sum.taxAmount.add(
            Prisma.Decimal.max(
              new Prisma.Decimal(0),
              new Prisma.Decimal(item.taxAmount).sub(returnedTax),
            ),
          ),
          totalAmount: sum.totalAmount.add(
            Prisma.Decimal.max(
              new Prisma.Decimal(0),
              new Prisma.Decimal(item.totalAmount).sub(returnedTotal),
            ),
          ),
          returnedValue: sum.returnedValue.add(returnedTotal),
          returnedSubtotal: sum.returnedSubtotal.add(returnedSubtotal),
        };
      },
      {
        subtotal: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
        returnedValue: new Prisma.Decimal(0),
        returnedSubtotal: new Prisma.Decimal(0),
      },
    );

    const initialPaid = sale.payments
      .filter((payment) => payment.paymentMethod !== PaymentMethod.CREDIT)
      .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
    const creditPaid = sale.creditSale
      ? ((
          await tx.creditPayment.aggregate({
            where: { creditSaleId: sale.creditSale.id },
            _sum: { amount: true },
          })
        )._sum.amount ?? new Prisma.Decimal(0))
      : new Prisma.Decimal(0);
    const totalPaidHistory = initialPaid.add(creditPaid);
    const saleAmountPaid = Prisma.Decimal.min(totals.totalAmount, totalPaidHistory);
    const saleBalanceDue = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      totals.totalAmount.sub(saleAmountPaid),
    );

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        amountPaid: saleAmountPaid,
        balanceDue: saleBalanceDue,
        paymentStatus: saleBalanceDue.eq(0)
          ? PaymentStatus.PAID
          : saleAmountPaid.gt(0)
            ? PaymentStatus.PARTIAL
            : PaymentStatus.UNPAID,
        syncVersion: { increment: 1 },
        deviceId: dto.deviceId ?? undefined,
      },
    });

    if (sale.creditSale) {
      const creditPrincipal = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        totals.totalAmount.sub(initialPaid),
      );
      const creditAmountPaid = Prisma.Decimal.min(creditPrincipal, creditPaid);
      const creditBalance = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        creditPrincipal.sub(creditAmountPaid),
      );

      await tx.creditSale.update({
        where: { id: sale.creditSale.id },
        data: {
          totalCredit: creditPrincipal,
          amountPaid: creditAmountPaid,
          balance: creditBalance,
          status: this.creditStatus(
            creditPrincipal,
            creditAmountPaid,
            sale.creditSale.dueDate,
          ),
        },
      });
    }

    if (sale.customerId) {
      const creditBalance = await tx.creditSale.aggregate({
        where: {
          customerId: sale.customerId,
          deletedAt: null,
          sale: { businessId, deletedAt: null },
        },
        _sum: { balance: true },
      });

      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          outstandingBalance: creditBalance._sum.balance ?? new Prisma.Decimal(0),
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
      });
    }
  }

  async returnAvailability(
    businessId: string,
    saleItemId: string,
    user: AuthenticatedUser,
  ) {
    const item = await this.getReturnableSaleItemOrThrow(
      businessId,
      { saleItemId },
      this.prisma,
    );
    if (item.sale.userId !== user.id && !this.canViewAllReturnRequests(user)) {
      throw new ForbiddenException(
        'Only the original seller can access this return',
      );
    }
    const history = await this.prisma.productReturnRequest.findMany({
      where: { businessId, saleItemId },
      select: {
        id: true,
        quantity: true,
        status: true,
        requestedAt: true,
        reviewedAt: true,
      },
      orderBy: { requestedAt: 'asc' },
    });
    const approved = history
      .filter((row) => row.status === ProductReturnRequestStatus.APPROVED)
      .reduce((sum, row) => sum + row.quantity, 0);
    const pending = history
      .filter((row) => row.status === ProductReturnRequestStatus.PENDING)
      .reduce((sum, row) => sum + row.quantity, 0);
    return {
      saleItemId,
      productId: item.productId,
      quantitySold: item.quantity,
      quantityReturned: approved,
      quantityPending: pending,
      quantityAvailable: Math.max(0, item.quantity - approved - pending),
      history,
    };
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
          amountPaid: true,
          payments: { select: { amount: true, paymentMethod: true } },
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
    await tx.$queryRaw`SELECT s.id FROM "Sale" s JOIN "ProductReturnRequest" r ON r."saleId" = s.id WHERE r.id = ${id}::uuid AND r."businessId" = ${businessId}::uuid FOR UPDATE OF s`;
    await tx.$queryRaw`SELECT id FROM "ProductReturnRequest" WHERE id = ${id}::uuid AND "businessId" = ${businessId}::uuid FOR UPDATE`;
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

  private validateStockInProductPricing(
    product: { sellingPrice: Prisma.Decimal; baseSellingPrice: Prisma.Decimal },
    pricing:
      | {
          purchasePrice?: number;
          sellingPrice?: number;
          baseSellingPrice?: number;
        }
      | undefined,
    user?: AuthenticatedUser,
  ) {
    if (!pricing) {
      return;
    }

    if (
      pricing.baseSellingPrice !== undefined &&
      normalizeSystemRoleName(user?.roleName) !== SYSTEM_ROLES.OWNER
    ) {
      throw new ForbiddenException(
        'Only the owner can manage base selling price',
      );
    }

    if (
      (pricing.sellingPrice !== undefined || pricing.baseSellingPrice !== undefined) &&
      new Prisma.Decimal(pricing.sellingPrice ?? product.sellingPrice).lt(
        pricing.baseSellingPrice ?? product.baseSellingPrice,
      )
    ) {
      throw new BadRequestException(
        'Selling price cannot be lower than base selling price',
      );
    }
  }

  async getStockInHistory(
    businessId: string,
    query: InventoryHistoryQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search?.trim();

    const where: Prisma.InventoryTransactionWhereInput = {
      businessId,
      transactionType: InventoryTransactionType.STOCK_IN,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { sku: { contains: search, mode: 'insensitive' } } },
              { referenceNumber: { contains: search, mode: 'insensitive' } },
              { remarks: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where }),
      this.prisma.inventoryTransaction.findMany({
        where,
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
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        businessId,
        entity: 'InventoryTransaction',
        entityId: { in: data.map((transaction) => transaction.id) },
      },
      include: {
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
    });
    const auditByEntityId = new Map(
      auditLogs.map((log) => [log.entityId, log.user]),
    );

    return {
      data: data.map((transaction) => ({
        ...transaction,
        addedBy: auditByEntityId.get(transaction.id) ?? null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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
      productPricing?: {
        purchasePrice?: number;
        sellingPrice?: number;
        baseSellingPrice?: number;
      };
    } = {},
  ) {
    const inventory = await this.assertInventoryContext(businessId, productId);
    this.validateStockInProductPricing(inventory.product, options.productPricing, options.user);
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

      if (
        transactionType === InventoryTransactionType.STOCK_IN &&
        options.productPricing &&
        (options.productPricing.purchasePrice !== undefined ||
          options.productPricing.sellingPrice !== undefined ||
          options.productPricing.baseSellingPrice !== undefined)
      ) {
        await tx.product.update({
          where: { id: productId },
          data: {
            ...(options.productPricing.purchasePrice !== undefined
              ? { purchasePrice: options.productPricing.purchasePrice }
              : {}),
            ...(options.productPricing.sellingPrice !== undefined
              ? { sellingPrice: options.productPricing.sellingPrice }
              : {}),
            ...(options.productPricing.baseSellingPrice !== undefined
              ? { baseSellingPrice: options.productPricing.baseSellingPrice }
              : {}),
          },
        });
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

      const transaction = await this.inventoryTransactionService.createTransaction(
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
            entity: 'InventoryTransaction',
            entityId: transaction.id,
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
    const purchasePrice = dto.purchasePrice ?? dto.unitCost;
    return this.applyInventoryMovement(
      businessId,
      dto.productId,
      dto.quantity,
      InventoryTransactionType.STOCK_IN,
      {
        referenceNumber: dto.referenceNumber,
        remarks: dto.remarks ?? 'Stock in',
        unitCost: purchasePrice ?? null,
        deviceId: dto.deviceId ?? null,
        user,
        productPricing: {
          purchasePrice,
          sellingPrice: dto.sellingPrice,
          baseSellingPrice: dto.baseSellingPrice,
        },
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
