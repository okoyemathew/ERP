import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseOrderStatus,
  InventoryTransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { AddPurchaseOrderItemDto } from './dto/add-purchase-order-item.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  private generateOrderNumber(): string {
    return `PO-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  async create(
    businessId: string,
    supplierId: string,
    dto: CreatePurchaseOrderDto,
    user?: AuthenticatedUser,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const orderNumber = dto.orderNumber?.trim() || this.generateOrderNumber();

    const existingOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        businessId,
        orderNumber,
      },
    });

    if (existingOrder) {
      throw new BadRequestException('Purchase order number already exists');
    }

    const purchaseOrder = await this.prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        orderNumber,
        orderDate: new Date(),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        subtotal: new Decimal(0),
        taxAmount: new Decimal(0),
        discountAmount: new Decimal(0),
        totalAmount: new Decimal(0),
        notes: dto.notes?.trim() || null,
        status: PurchaseOrderStatus.DRAFT,
      },
      include: {
        items: true,
        supplier: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'CREATE',
        entity: 'PurchaseOrder',
        entityId: purchaseOrder.id,
        description: `Created purchase order ${purchaseOrder.orderNumber}`,
        deviceId: null,
      },
    });

    return purchaseOrder;
  }

  async addItem(
    businessId: string,
    purchaseOrderId: string,
    dto: AddPurchaseOrderItemDto,
    user?: AuthenticatedUser,
  ) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, businessId },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft purchase orders can be modified',
      );
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, businessId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const unitPrice = new Decimal(dto.unitPrice);
    const quantity = dto.quantity;
    const totalPrice = unitPrice.mul(quantity);

    const item = await this.prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId,
        productId: dto.productId,
        quantity,
        unitPrice,
        totalPrice,
      },
    });

    await this.recalculatePurchaseOrderTotals(purchaseOrderId);

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'CREATE',
        entity: 'PurchaseOrderItem',
        entityId: item.id,
        description: `Added item to purchase order ${purchaseOrder.orderNumber}`,
        deviceId: null,
      },
    });

    return await this.findOne(businessId, purchaseOrderId);
  }

  async removeItem(
    businessId: string,
    purchaseOrderId: string,
    itemId: string,
    user?: AuthenticatedUser,
  ) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, businessId },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft purchase orders can be modified',
      );
    }

    const item = await this.prisma.purchaseOrderItem.findFirst({
      where: { id: itemId, purchaseOrderId },
    });

    if (!item) {
      throw new NotFoundException('Purchase order item not found');
    }

    await this.prisma.purchaseOrderItem.delete({
      where: { id: itemId },
    });

    await this.recalculatePurchaseOrderTotals(purchaseOrderId);

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'DELETE',
        entity: 'PurchaseOrderItem',
        entityId: itemId,
        description: `Removed item from purchase order ${purchaseOrder.orderNumber}`,
        deviceId: null,
      },
    });

    return await this.findOne(businessId, purchaseOrderId);
  }

  private async recalculatePurchaseOrderTotals(purchaseOrderId: string) {
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId },
    });

    const subtotal = items.reduce(
      (sum, item) => sum.plus(item.totalPrice),
      new Decimal(0),
    );

    await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        subtotal,
        totalAmount: subtotal,
      },
    });
  }

  async findOne(businessId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
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

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    return purchaseOrder;
  }

  async findAll(businessId: string, query: PurchaseOrderQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const search = query.search?.trim();

    const where: Prisma.PurchaseOrderWhereInput = {
      businessId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
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
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
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
    query: PurchaseOrderQueryDto = {},
  ) {
    const search = term.trim();
    if (!search) {
      return this.findAll(businessId, query);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, items] = await Promise.all([
      this.prisma.purchaseOrder.count({
        where: {
          businessId,
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            {
              supplier: {
                companyName: { contains: search, mode: 'insensitive' },
              },
            },
          ],
        },
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          businessId,
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
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

  async update(
    businessId: string,
    id: string,
    dto: UpdatePurchaseOrderDto,
    user?: AuthenticatedUser,
  ) {
    const purchaseOrder = await this.findOne(businessId, id);

    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft purchase orders can be updated',
      );
    }

    if (dto.supplierId && dto.supplierId !== purchaseOrder.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, businessId, deletedAt: null },
      });

      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
    }

    const updatedOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
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

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'UPDATE',
        entity: 'PurchaseOrder',
        entityId: id,
        description: `Updated purchase order ${updatedOrder.orderNumber}`,
        deviceId: null,
      },
    });

    return updatedOrder;
  }

  async submit(businessId: string, id: string, user?: AuthenticatedUser) {
    const purchaseOrder = await this.findOne(businessId, id);

    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft purchase orders can be submitted',
      );
    }

    if (purchaseOrder.items.length === 0) {
      throw new BadRequestException('Cannot submit empty purchase order');
    }

    const updatedOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.PENDING,
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

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'UPDATE',
        entity: 'PurchaseOrderStatus',
        entityId: id,
        description: `Submitted purchase order ${updatedOrder.orderNumber}`,
        deviceId: null,
      },
    });

    return updatedOrder;
  }

  async approve(businessId: string, id: string, user?: AuthenticatedUser) {
    const purchaseOrder = await this.findOne(businessId, id);

    if (purchaseOrder.status !== PurchaseOrderStatus.PENDING) {
      throw new BadRequestException(
        'Only pending purchase orders can be approved',
      );
    }

    const updatedOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.APPROVED,
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

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'UPDATE',
        entity: 'PurchaseOrderStatus',
        entityId: id,
        description: `Approved purchase order ${updatedOrder.orderNumber}`,
        deviceId: null,
      },
    });

    return updatedOrder;
  }

  async cancel(businessId: string, id: string, user?: AuthenticatedUser) {
    const purchaseOrder = await this.findOne(businessId, id);

    if (
      purchaseOrder.status === PurchaseOrderStatus.RECEIVED ||
      purchaseOrder.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot cancel a received or already cancelled purchase order',
      );
    }

    const updatedOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
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

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'UPDATE',
        entity: 'PurchaseOrderStatus',
        entityId: id,
        description: `Cancelled purchase order ${updatedOrder.orderNumber}`,
        deviceId: null,
      },
    });

    return updatedOrder;
  }

  async receive(
    businessId: string,
    id: string,
    dto: ReceivePurchaseOrderDto,
    user?: AuthenticatedUser,
  ) {
    const purchaseOrder = await this.findOne(businessId, id);

    if (purchaseOrder.status !== PurchaseOrderStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved purchase orders can be marked as received',
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseOrderStatus.RECEIVED,
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

      for (const item of purchaseOrder.items) {
        await this.inventoryService.stockIn(
          businessId,
          {
            productId: item.productId,
            quantity: item.quantity,
            transactionType: InventoryTransactionType.STOCK_IN,
            referenceNumber: purchaseOrder.orderNumber,
            remarks:
              dto.remarks ?? `Received from PO ${purchaseOrder.orderNumber}`,
            unitCost: item.unitPrice.toNumber(),
            deviceId: undefined,
          },
          user,
        );
      }

      await tx.auditLog.create({
        data: {
          businessId,
          userId: user?.id ?? null,
          action: 'UPDATE',
          entity: 'PurchaseOrderStatus',
          entityId: id,
          description: `Marked purchase order ${updatedOrder.orderNumber} as received`,
          deviceId: null,
        },
      });

      return updatedOrder;
    });
  }
}
