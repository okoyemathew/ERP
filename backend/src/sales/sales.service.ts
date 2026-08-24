import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CashRegisterStatus,
  CashTransactionType,
  CreditSaleStatus,
  EmployeeStatus,
  InventoryTransactionType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteSaleDto } from './dto/complete-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PaymentDto } from './dto/payment.dto';
import { ReceiptQueryDto } from './dto/receipt-query.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { AddSaleItemDto } from './dto/sale-item.dto';
import { UpdateSaleCustomerDto } from './dto/update-sale-customer.dto';

type Tx = Prisma.TransactionClient;
type ReceiptPrintWidth = '58mm' | '80mm';
type ReceiptLine = {
  type: 'center' | 'divider' | 'row' | 'text';
  text?: string;
  left?: string;
  right?: string;
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    dto: CreateSaleDto,
    user: AuthenticatedUser,
  ) {
    await this.assertCanSell(businessId, user);
    this.assertDiscountAllowed(dto.items ?? [], user);
    await this.assertCustomer(businessId, dto.customerId);

    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existing = await this.prisma.sale.findFirst({
        where: { businessId, idempotencyKey },
        include: this.saleInclude(),
      });

      if (existing) {
        return existing;
      }
    }

    if (dto.payments?.length && (!dto.items || dto.items.length === 0)) {
      throw new BadRequestException(
        'Items are required when payments are provided',
      );
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const saleNumber = await this.nextSaleNumber(businessId, tx);
      const created = await tx.sale.create({
        data: {
          businessId,
          customerId: dto.customerId ?? null,
          userId: user.id,
          saleNumber,
          idempotencyKey: idempotencyKey || null,
          status: SaleStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          remarks: dto.remarks?.trim() || null,
          deviceId: dto.deviceId ?? null,
          isSynced: true,
          syncVersion: 1,
        },
      });

      if (dto.items?.length) {
        await this.replaceItems(businessId, created.id, dto.items, tx);
      }

      await this.recalculateSale(created.id, tx);

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.SALE_CREATED,
        entity: 'Sale',
        entityId: created.id,
        description: `Created pending sale ${saleNumber}`,
        deviceId: dto.deviceId,
      });

      if (dto.payments?.length) {
        return this.completeSale(
          businessId,
          created.id,
          dto as CompleteSaleDto,
          user,
          tx,
        );
      }

      return this.getSaleOrThrow(businessId, created.id, tx);
    });

    return sale;
  }

  async findAll(businessId: string, query: SaleQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'saleDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildWhere(businessId, query);

    const [total, data] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: this.saleInclude(),
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
    return this.getSaleOrThrow(businessId, id, this.prisma);
  }

  async lookupProduct(
    businessId: string,
    lookup: { productId?: string; barcode?: string; sku?: string },
  ) {
    const product = await this.findSellableProduct(
      businessId,
      lookup,
      this.prisma,
    );

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      unitPrice: product.sellingPrice,
      availableQuantity: product.inventory?.quantityAvailable ?? 0,
      quantityOnHand: product.inventory?.quantityOnHand ?? 0,
    };
  }

  async validateCart(businessId: string, id: string) {
    const sale = await this.getSaleOrThrow(businessId, id, this.prisma);
    this.assertPending(sale.status);
    const issues = await this.cartIssues(businessId, sale.items, this.prisma);

    return {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      valid: issues.length === 0,
      issues,
      totals: this.sumSaleItems(sale.items),
    };
  }

  async getSaleReceipt(businessId: string, saleId: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { saleId, sale: { businessId, status: SaleStatus.COMPLETED } },
      include: this.receiptInclude(),
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found for completed sale');
    }

    return this.formatReceipt(receipt);
  }

  async findReceipts(businessId: string, query: ReceiptQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildReceiptWhere(businessId, query);

    const [total, receipts] = await Promise.all([
      this.prisma.receipt.count({ where }),
      this.prisma.receipt.findMany({
        where,
        include: this.receiptInclude(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: receipts.map((receipt) => this.formatReceipt(receipt)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getReceipt(businessId: string, id: string) {
    const receipt = await this.getReceiptOrThrow(businessId, id, this.prisma);
    return this.formatReceipt(receipt);
  }

  async getReceiptPrintData(businessId: string, id: string) {
    const receipt = await this.getReceiptOrThrow(businessId, id, this.prisma);
    return this.toPrintReadyReceipt(receipt);
  }

  async reprintReceipt(
    businessId: string,
    id: string,
    user: AuthenticatedUser,
  ) {
    const receipt = await this.prisma.$transaction(async (tx) => {
      const current = await this.getReceiptOrThrow(businessId, id, tx);
      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entity: 'Receipt',
        entityId: id,
        description: `Reprinted receipt ${current.receiptNumber}`,
      });
      return current;
    });

    return this.toPrintReadyReceipt(receipt, true);
  }

  async selectCustomer(
    businessId: string,
    id: string,
    dto: UpdateSaleCustomerDto,
    user: AuthenticatedUser,
  ) {
    await this.assertCanSell(businessId, user);
    await this.assertCustomer(businessId, dto.customerId ?? undefined);

    const sale = await this.prisma.$transaction(async (tx) => {
      const current = await this.getSaleOrThrow(businessId, id, tx);
      this.assertPending(current.status);

      await tx.sale.update({
        where: { id },
        data: {
          customerId: dto.customerId ?? null,
          deviceId: dto.deviceId ?? undefined,
          syncVersion: { increment: 1 },
        },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entity: 'SaleCustomer',
        entityId: id,
        description: `Updated customer for sale ${current.saleNumber}`,
        deviceId: dto.deviceId,
      });

      return this.getSaleOrThrow(businessId, id, tx);
    });

    return sale;
  }

  async addItem(
    businessId: string,
    id: string,
    dto: AddSaleItemDto,
    user: AuthenticatedUser,
  ) {
    await this.assertCanSell(businessId, user);
    this.assertDiscountAllowed([dto], user);

    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getSaleOrThrow(businessId, id, tx);
      this.assertPending(sale.status);
      const item = await this.buildItemData(businessId, dto, tx);
      const existing = sale.items.find(
        (saleItem) => saleItem.productId === item.productId,
      );

      if (existing) {
        await tx.saleItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + dto.quantity,
            unitPrice: item.unitPrice,
            discountAmount: new Prisma.Decimal(existing.discountAmount).add(
              item.discountAmount,
            ),
            taxAmount: new Prisma.Decimal(existing.taxAmount).add(
              item.taxAmount,
            ),
            totalAmount: new Prisma.Decimal(existing.totalAmount).add(
              item.totalAmount,
            ),
          },
        });
      } else {
        await tx.saleItem.create({ data: { saleId: id, ...item } });
      }

      await this.recalculateSale(id, tx);
      return this.getSaleOrThrow(businessId, id, tx);
    });
  }

  async removeItem(
    businessId: string,
    id: string,
    saleItemId: string,
    user: AuthenticatedUser,
  ) {
    await this.assertCanSell(businessId, user);

    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getSaleOrThrow(businessId, id, tx);
      this.assertPending(sale.status);
      const item = sale.items.find((saleItem) => saleItem.id === saleItemId);

      if (!item) {
        throw new NotFoundException('Sale item not found');
      }

      await tx.saleItem.delete({ where: { id: saleItemId } });
      await this.recalculateSale(id, tx);
      return this.getSaleOrThrow(businessId, id, tx);
    });
  }

  async complete(
    businessId: string,
    id: string,
    dto: CompleteSaleDto,
    user: AuthenticatedUser,
  ) {
    await this.assertCanSell(businessId, user);

    return this.prisma.$transaction((tx) =>
      this.completeSale(businessId, id, dto, user, tx),
    );
  }

  async cancelPending(businessId: string, id: string, user: AuthenticatedUser) {
    if (
      ![SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER].includes(
        user.roleName as never,
      )
    ) {
      throw new ForbiddenException(
        'Only Owner, Admin, or Manager can cancel pending sales',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getSaleOrThrow(businessId, id, tx);
      this.assertPending(sale.status);

      await tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CANCELLED,
          syncVersion: { increment: 1 },
        },
      });

      await this.audit(tx, {
        businessId,
        userId: user.id,
        action: AuditAction.SALE_CANCELLED,
        entity: 'Sale',
        entityId: id,
        description: `Cancelled pending sale ${sale.saleNumber}`,
      });

      return this.getSaleOrThrow(businessId, id, tx);
    });
  }

  private async completeSale(
    businessId: string,
    id: string,
    dto: CompleteSaleDto,
    user: AuthenticatedUser,
    tx: Tx,
  ) {
    const sale = await this.getSaleOrThrow(businessId, id, tx);
    this.assertPending(sale.status);

    if (sale.items.length === 0) {
      throw new BadRequestException('Sale must contain at least one item');
    }

    this.validatePayments(
      dto.payments,
      sale.totalAmount,
      Boolean(sale.customerId),
    );
    await this.validateSaleInventory(businessId, sale.items, tx);

    const totals = this.sumSaleItems(sale.items);
    const cashPaid = this.sumCashPayments(dto.payments);
    const creditAmount = this.sumCreditPayments(dto.payments);
    const amountPaid = cashPaid.gt(totals.totalAmount)
      ? totals.totalAmount
      : cashPaid;
    const paymentStatus = this.paymentStatus(amountPaid, totals.totalAmount);
    const balanceDue = amountPaid.gte(totals.totalAmount)
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(totals.totalAmount).sub(amountPaid);

    await tx.payment.deleteMany({ where: { saleId: id } });
    await tx.creditSale.deleteMany({ where: { saleId: id } });
    for (const payment of dto.payments) {
      if (
        payment.amount <= 0 ||
        payment.paymentMethod === PaymentMethod.CREDIT
      ) {
        continue;
      }

      await tx.payment.create({
        data: {
          businessId,
          saleId: id,
          customerId: sale.customerId,
          userId: user.id,
          paymentMethod: payment.paymentMethod,
          amount: payment.amount,
          referenceNumber: payment.referenceNumber?.trim() || null,
          notes: payment.notes?.trim() || null,
        },
      });

      if (payment.paymentMethod === PaymentMethod.CASH) {
        await this.recordCashRegisterTransaction(tx, {
          businessId,
          userId: user.id,
          transactionType: CashTransactionType.SALE,
          amount: new Prisma.Decimal(payment.amount),
          reference: sale.saleNumber,
          description: `Cash sale: ${sale.saleNumber}`,
          transactionDate: new Date(),
        });
      }
    }

    if (creditAmount.gt(0)) {
      if (!sale.customerId) {
        throw new BadRequestException(
          'Credit sale must be assigned to a customer',
        );
      }

      await tx.creditSale.create({
        data: {
          saleId: id,
          customerId: sale.customerId,
          totalCredit: creditAmount,
          amountPaid: new Prisma.Decimal(0),
          balance: creditAmount,
          status: CreditSaleStatus.ACTIVE,
        },
      });

      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          outstandingBalance: { increment: creditAmount },
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
      });
    }

    for (const item of sale.items) {
      const inventory = await tx.inventory.findUnique({
        where: { productId: item.productId },
        include: { product: { select: { name: true, minimumStock: true } } },
      });

      if (!inventory || inventory.businessId !== businessId) {
        throw new BadRequestException(
          `Inventory not found for product ${item.productId}`,
        );
      }

      const quantityBefore = inventory.quantityOnHand;
      const quantityAfter = quantityBefore - item.quantity;

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          quantityOnHand: quantityAfter,
          quantityAvailable: Math.max(
            0,
            inventory.quantityAvailable - item.quantity,
          ),
          lastStockUpdate: new Date(),
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          inventoryId: inventory.id,
          productId: item.productId,
          transactionType: InventoryTransactionType.SALE,
          quantity: item.quantity,
          quantityBefore,
          quantityAfter,
          unitCost: item.unitPrice,
          referenceNumber: sale.saleNumber,
          remarks: `Sale ${sale.saleNumber}`,
          transactionDate: new Date(),
          deviceId: dto.deviceId ?? null,
          isSynced: true,
          syncVersion: 1,
        },
      });

      if (quantityAfter <= inventory.product.minimumStock) {
        await tx.notification.create({
          data: {
            businessId,
            title: 'Low stock',
            message: `${inventory.product.name} is at ${quantityAfter} units`,
            type: 'WARNING',
          },
        });
      }
    }

    await tx.sale.update({
      where: { id },
      data: {
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        amountPaid,
        balanceDue,
        paymentStatus,
        status: SaleStatus.COMPLETED,
        saleDate: new Date(),
        remarks: dto.remarks?.trim() || sale.remarks,
        deviceId: dto.deviceId ?? undefined,
        syncVersion: { increment: 1 },
      },
    });

    await this.createReceipt(id, sale.saleNumber, tx);

    await tx.notification.create({
      data: {
        businessId,
        title: 'Sale completed',
        message: `${sale.saleNumber} completed for ${totals.totalAmount.toFixed(2)}`,
        type: 'SUCCESS',
      },
    });

    await this.audit(tx, {
      businessId,
      userId: user.id,
      action: AuditAction.SALE_CREATED,
      entity: 'Sale',
      entityId: id,
      description: `Completed sale ${sale.saleNumber}`,
      deviceId: dto.deviceId,
    });

    return this.getSaleOrThrow(businessId, id, tx);
  }

  private async replaceItems(
    businessId: string,
    saleId: string,
    items: AddSaleItemDto[],
    tx: Tx,
  ) {
    await tx.saleItem.deleteMany({ where: { saleId } });

    for (const item of items) {
      const data = await this.buildItemData(businessId, item, tx);
      await tx.saleItem.create({ data: { saleId, ...data } });
    }
  }

  private async buildItemData(businessId: string, dto: AddSaleItemDto, tx: Tx) {
    const product = await this.findSellableProduct(businessId, dto, tx);

    if (!product.inventory || product.inventory.deletedAt) {
      throw new BadRequestException('Product inventory is not available');
    }

    if (
      product.inventory.quantityAvailable < dto.quantity ||
      product.inventory.quantityOnHand < dto.quantity
    ) {
      throw new BadRequestException('Insufficient inventory for product');
    }

    const unitPrice = new Prisma.Decimal(product.sellingPrice);
    const discountAmount = new Prisma.Decimal(dto.discountAmount ?? 0);
    const taxAmount = new Prisma.Decimal(dto.taxAmount ?? 0);
    const gross = unitPrice.mul(dto.quantity);

    if (discountAmount.gt(gross)) {
      throw new BadRequestException('Discount cannot exceed item subtotal');
    }

    return {
      productId: product.id,
      quantity: dto.quantity,
      unitPrice,
      discountAmount,
      taxAmount,
      totalAmount: gross.sub(discountAmount).add(taxAmount),
    };
  }

  private async recalculateSale(saleId: string, tx: Tx) {
    const items = await tx.saleItem.findMany({ where: { saleId } });
    const totals = this.sumSaleItems(items);

    await tx.sale.update({
      where: { id: saleId },
      data: {
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        amountPaid: 0,
        balanceDue: totals.totalAmount,
        paymentStatus: PaymentStatus.UNPAID,
        syncVersion: { increment: 1 },
      },
    });
  }

  private sumSaleItems(
    items: Array<{
      quantity: number;
      unitPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
    }>,
  ) {
    return items.reduce(
      (totals, item) => ({
        subtotal: totals.subtotal.add(
          new Prisma.Decimal(item.unitPrice).mul(item.quantity),
        ),
        discountAmount: totals.discountAmount.add(item.discountAmount),
        taxAmount: totals.taxAmount.add(item.taxAmount),
        totalAmount: totals.totalAmount.add(item.totalAmount),
      }),
      {
        subtotal: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
      },
    );
  }

  private async validateSaleInventory(
    businessId: string,
    items: Array<{ productId: string; quantity: number }>,
    tx: Tx,
  ) {
    const issues = await this.cartIssues(businessId, items, tx);

    if (issues.length > 0) {
      throw new BadRequestException({
        message: 'Sale cart validation failed',
        issues,
      });
    }
  }

  private validatePayments(
    payments: PaymentDto[],
    totalAmount: Prisma.Decimal,
    hasCustomer: boolean,
  ) {
    if (!payments?.length) {
      throw new BadRequestException('At least one payment is required');
    }

    if (payments.every((payment) => payment.amount <= 0)) {
      throw new BadRequestException(
        'At least one payment amount must be greater than zero',
      );
    }

    const cashPaid = this.sumCashPayments(payments);
    const creditAmount = this.sumCreditPayments(payments);
    const amountTendered = cashPaid.add(creditAmount);
    const changeAllowed = payments.some(
      (payment) =>
        payment.paymentMethod !== PaymentMethod.CREDIT && payment.allowChange,
    );

    if (creditAmount.gt(0) && !hasCustomer) {
      throw new BadRequestException(
        'Credit sale must be assigned to a customer',
      );
    }

    if (creditAmount.gt(totalAmount)) {
      throw new BadRequestException('Credit amount cannot exceed sale total');
    }

    const remainingAfterCash = cashPaid.gte(totalAmount)
      ? new Prisma.Decimal(0)
      : totalAmount.sub(cashPaid);
    if (creditAmount.gt(remainingAfterCash)) {
      throw new BadRequestException(
        'Credit amount cannot exceed the unpaid balance',
      );
    }

    if (amountTendered.lt(totalAmount)) {
      throw new BadRequestException(
        'Payment total must cover the sale total or remaining credit amount',
      );
    }

    if (amountTendered.gt(totalAmount) && !changeAllowed) {
      throw new BadRequestException(
        'Payment cannot exceed sale total unless change is explicitly allowed',
      );
    }
  }

  private sumPayments(payments: PaymentDto[]) {
    return payments.reduce(
      (total, payment) => total.add(payment.amount),
      new Prisma.Decimal(0),
    );
  }

  private sumCashPayments(payments: PaymentDto[]) {
    return payments.reduce(
      (total, payment) =>
        payment.paymentMethod === PaymentMethod.CREDIT
          ? total
          : total.add(payment.amount),
      new Prisma.Decimal(0),
    );
  }

  private sumCreditPayments(payments: PaymentDto[]) {
    return payments.reduce(
      (total, payment) =>
        payment.paymentMethod === PaymentMethod.CREDIT
          ? total.add(payment.amount)
          : total,
      new Prisma.Decimal(0),
    );
  }

  private paymentStatus(
    amountPaid: Prisma.Decimal,
    totalAmount: Prisma.Decimal,
  ) {
    if (amountPaid.lte(0)) {
      return PaymentStatus.UNPAID;
    }
    if (amountPaid.gte(totalAmount)) {
      return PaymentStatus.PAID;
    }
    return PaymentStatus.PARTIAL;
  }

  private async assertCanSell(businessId: string, user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        businessId,
        userId: user.id,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
        canSell: true,
      },
      select: { id: true },
    });

    const adminRole = [
      SYSTEM_ROLES.OWNER,
      SYSTEM_ROLES.ADMIN,
      SYSTEM_ROLES.MANAGER,
    ].includes(user.roleName as never);
    if (!employee && !adminRole) {
      throw new ForbiddenException('User is not allowed to perform sales');
    }
  }

  private async assertCustomer(businessId: string, customerId?: string) {
    if (!customerId) {
      return;
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
      select: { id: true },
    });

    if (!customer) {
      throw new BadRequestException(
        'Customer does not belong to this business',
      );
    }
  }

  private assertDiscountAllowed(
    items: AddSaleItemDto[],
    user: AuthenticatedUser,
  ) {
    const hasDiscount = items.some((item) => (item.discountAmount ?? 0) > 0);
    const allowed = [
      SYSTEM_ROLES.OWNER,
      SYSTEM_ROLES.ADMIN,
      SYSTEM_ROLES.MANAGER,
    ].includes(user.roleName as never);

    if (hasDiscount && !allowed) {
      throw new ForbiddenException('User is not allowed to apply discounts');
    }
  }

  private async findSellableProduct(
    businessId: string,
    lookup: { productId?: string; barcode?: string; sku?: string },
    tx: Tx | PrismaService,
  ) {
    const productId = lookup.productId?.trim();
    const barcode = lookup.barcode?.trim();
    const sku = lookup.sku?.trim();

    if (!productId && !barcode && !sku) {
      throw new BadRequestException('productId, barcode, or sku is required');
    }

    const product = await tx.product.findFirst({
      where: {
        businessId,
        isActive: true,
        OR: [
          ...(productId ? [{ id: productId }] : []),
          ...(barcode ? [{ barcode }] : []),
          ...(barcode ? [{ barcodes: { some: { barcode } } }] : []),
          ...(sku ? [{ sku }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        sellingPrice: true,
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found or inactive');
    }

    if (new Prisma.Decimal(product.sellingPrice).lt(0)) {
      throw new BadRequestException('Product selling price is invalid');
    }

    return product;
  }

  private async cartIssues(
    businessId: string,
    items: Array<{ productId: string; quantity: number }>,
    tx: Tx | PrismaService,
  ) {
    const issues: Array<{ productId: string; message: string }> = [];

    for (const item of items) {
      if (item.quantity <= 0) {
        issues.push({
          productId: item.productId,
          message: 'Quantity must be greater than zero',
        });
        continue;
      }

      const product = await tx.product.findFirst({
        where: { id: item.productId, businessId, isActive: true },
        select: { id: true, sellingPrice: true, inventory: true },
      });

      if (!product) {
        issues.push({
          productId: item.productId,
          message: 'Product not found or inactive',
        });
        continue;
      }

      if (new Prisma.Decimal(product.sellingPrice).lt(0)) {
        issues.push({
          productId: item.productId,
          message: 'Product selling price is invalid',
        });
      }

      if (!product.inventory || product.inventory.deletedAt) {
        issues.push({
          productId: item.productId,
          message: 'Inventory is not available',
        });
        continue;
      }

      if (
        product.inventory.quantityAvailable < item.quantity ||
        product.inventory.quantityOnHand < item.quantity
      ) {
        issues.push({
          productId: item.productId,
          message: 'Insufficient stock',
        });
      }
    }

    return issues;
  }

  private assertPending(status: SaleStatus) {
    if (status !== SaleStatus.PENDING) {
      throw new BadRequestException(
        'Completed, cancelled, or refunded sales cannot be edited',
      );
    }
  }

  private async createReceipt(saleId: string, saleNumber: string, tx: Tx) {
    const existing = await tx.receipt.findUnique({ where: { saleId } });
    if (existing) {
      return existing;
    }

    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: { include: { product: true } } },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return tx.receipt.create({
      data: {
        saleId,
        receiptNumber: `RCT-${saleNumber}`,
        items: {
          create: sale.items.map((item) => ({
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
          })),
        },
      },
    });
  }

  private async getReceiptOrThrow(
    businessId: string,
    id: string,
    tx: Tx | PrismaService,
  ) {
    const receipt = await tx.receipt.findFirst({
      where: { id, sale: { businessId, status: SaleStatus.COMPLETED } },
      include: this.receiptInclude(),
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  private formatReceipt(
    receipt: Prisma.ReceiptGetPayload<{
      include: ReturnType<SalesService['receiptInclude']>;
    }>,
  ) {
    const sale = receipt.sale;
    const business = sale.business;
    const settings = business.receiptSettings;
    const saleItems = sale.items;

    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      createdAt: receipt.createdAt,
      printed: receipt.printed,
      printedAt: receipt.printedAt,
      immutable: true,
      business: {
        id: business.id,
        name: settings?.businessName ?? business.name,
        address: settings?.businessAddress ?? business.address,
        phone: settings?.businessPhone ?? business.phone,
        currency: business.currency,
      },
      settings: {
        paperWidth: this.normalizePaperWidth(settings?.paperWidth),
        footerMessage: settings?.footerMessage ?? null,
        autoPrint: settings?.autoPrint ?? false,
        showLogo: settings?.showLogo ?? true,
      },
      sale: {
        id: sale.id,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate,
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        amountPaid: sale.amountPaid,
        balanceDue: sale.balanceDue,
        paymentStatus: sale.paymentStatus,
      },
      employee: {
        id: sale.user.id,
        name: `${sale.user.firstName} ${sale.user.lastName}`.trim(),
        username: sale.user.username,
      },
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name:
              sale.customer.companyName ||
              `${sale.customer.firstName} ${sale.customer.lastName ?? ''}`.trim(),
            phone: sale.customer.phone,
          }
        : {
            id: null,
            name: 'Walk-in Customer',
            phone: null,
          },
      items: receipt.items.map((item, index) => ({
        id: item.id,
        productId: saleItems[index]?.productId ?? null,
        productName: item.productName,
        sku: saleItems[index]?.product.sku ?? null,
        barcode: saleItems[index]?.product.barcode ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount:
          saleItems[index]?.discountAmount ?? new Prisma.Decimal(0),
        taxAmount: saleItems[index]?.taxAmount ?? new Prisma.Decimal(0),
        totalAmount: item.totalAmount,
      })),
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        referenceNumber: payment.referenceNumber,
        paymentDate: payment.paymentDate,
      })),
      footerMessage: settings?.footerMessage ?? null,
    };
  }

  private toPrintReadyReceipt(
    receipt: Prisma.ReceiptGetPayload<{
      include: ReturnType<SalesService['receiptInclude']>;
    }>,
    reprint = false,
  ) {
    const data = this.formatReceipt(receipt);
    const paperWidth = data.settings.paperWidth;
    const columns = paperWidth === '58mm' ? 32 : 48;
    const lines = this.buildReceiptLines(data, columns, reprint);

    return {
      format: 'thermal-receipt-v1',
      paperWidth,
      columns,
      reprint,
      immutable: true,
      clientPrintRequired: true,
      supportedPaperWidths: ['58mm', '80mm'] as const,
      data,
      lines,
      text: this.buildReceiptText(lines, columns),
      commands: {
        encoding: 'utf-8',
        cutPaper: true,
        openCashDrawer: false,
      },
    };
  }

  private buildReceiptLines(
    receipt: ReturnType<SalesService['formatReceipt']>,
    columns: number,
    reprint: boolean,
  ) {
    const divider = '-'.repeat(columns);
    const lines: ReceiptLine[] = [
      { type: 'center', text: receipt.business.name },
    ];

    if (receipt.business.address) {
      lines.push({ type: 'center', text: receipt.business.address });
    }
    if (receipt.business.phone) {
      lines.push({ type: 'center', text: receipt.business.phone });
    }
    if (reprint) {
      lines.push({ type: 'center', text: 'REPRINT' });
    }

    lines.push(
      { type: 'divider', text: divider },
      { type: 'row', left: 'Receipt', right: receipt.receiptNumber },
      {
        type: 'row',
        left: 'Date',
        right: new Date(receipt.sale.saleDate).toISOString(),
      },
      {
        type: 'row',
        left: 'Employee',
        right: receipt.employee.name || receipt.employee.username,
      },
      { type: 'row', left: 'Customer', right: receipt.customer.name },
      { type: 'divider', text: divider },
    );

    for (const item of receipt.items) {
      lines.push(
        { type: 'text', text: item.productName },
        {
          type: 'row',
          left: `${item.quantity} x ${this.money(item.unitPrice)}`,
          right: this.money(item.totalAmount),
        },
      );
      if (Number(item.discountAmount) > 0) {
        lines.push({
          type: 'row',
          left: 'Discount',
          right: `-${this.money(item.discountAmount)}`,
        });
      }
      if (Number(item.taxAmount) > 0) {
        lines.push({
          type: 'row',
          left: 'Tax',
          right: this.money(item.taxAmount),
        });
      }
    }

    lines.push(
      { type: 'divider', text: divider },
      {
        type: 'row',
        left: 'Subtotal',
        right: this.money(receipt.sale.subtotal),
      },
      {
        type: 'row',
        left: 'Discount',
        right: this.money(receipt.sale.discountAmount),
      },
      { type: 'row', left: 'Tax', right: this.money(receipt.sale.taxAmount) },
      {
        type: 'row',
        left: 'Total',
        right: this.money(receipt.sale.totalAmount),
      },
      { type: 'row', left: 'Paid', right: this.money(receipt.sale.amountPaid) },
      {
        type: 'row',
        left: 'Balance',
        right: this.money(receipt.sale.balanceDue),
      },
      { type: 'divider', text: divider },
    );

    for (const payment of receipt.payments) {
      lines.push({
        type: 'row',
        left: payment.paymentMethod,
        right: this.money(payment.amount),
      });
    }

    if (receipt.footerMessage) {
      lines.push(
        { type: 'divider', text: divider },
        { type: 'center', text: receipt.footerMessage },
      );
    }

    return lines;
  }

  private buildReceiptText(lines: ReceiptLine[], columns: number) {
    const rendered: string[] = [];

    for (const line of lines) {
      if (line.type === 'divider') {
        rendered.push(line.text ?? '-'.repeat(columns));
        continue;
      }

      if (line.type === 'center') {
        for (const text of this.wrapText(line.text ?? '', columns)) {
          rendered.push(this.centerText(text, columns));
        }
        continue;
      }

      if (line.type === 'row') {
        rendered.push(
          ...this.rowText(line.left ?? '', line.right ?? '', columns),
        );
        continue;
      }

      rendered.push(...this.wrapText(line.text ?? '', columns));
    }

    return rendered.join('\n');
  }

  private rowText(left: string, right: string, columns: number) {
    const gap = 1;
    const rightText = String(right);

    if (rightText.length + gap >= columns) {
      return [
        ...this.wrapText(left, columns),
        ...this.wrapText(rightText, columns).map((line) =>
          line.padStart(columns),
        ),
      ];
    }

    const leftWidth = columns - rightText.length - gap;
    const leftLines = this.wrapText(left, leftWidth);
    return leftLines.map((line, index) =>
      index === 0 ? `${line.padEnd(leftWidth + gap)}${rightText}` : line,
    );
  }

  private centerText(text: string, columns: number) {
    const trimmed = text.length > columns ? text.slice(0, columns) : text;
    return trimmed.padStart(
      trimmed.length + Math.floor((columns - trimmed.length) / 2),
    );
  }

  private wrapText(text: string, columns: number) {
    const width = Math.max(1, columns);
    const normalized = String(text).replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return [''];
    }

    const lines: string[] = [];
    let current = '';

    for (const word of normalized.split(' ')) {
      const chunks = this.chunkWord(word, width);

      for (const chunk of chunks) {
        if (!current) {
          current = chunk;
          continue;
        }

        if (`${current} ${chunk}`.length <= width) {
          current = `${current} ${chunk}`;
          continue;
        }

        lines.push(current);
        current = chunk;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  private chunkWord(word: string, columns: number) {
    const chunks: string[] = [];
    for (let index = 0; index < word.length; index += columns) {
      chunks.push(word.slice(index, index + columns));
    }
    return chunks;
  }

  private buildReceiptWhere(
    businessId: string,
    query: ReceiptQueryDto,
  ): Prisma.ReceiptWhereInput {
    const search = query.search?.trim();

    return {
      sale: {
        businessId,
        status: SaleStatus.COMPLETED,
      },
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                receiptNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                sale: {
                  saleNumber: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                sale: {
                  customer: {
                    firstName: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
              {
                sale: {
                  customer: {
                    lastName: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
              {
                sale: {
                  user: {
                    firstName: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
              {
                sale: {
                  user: {
                    lastName: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private normalizePaperWidth(paperWidth?: string | null): ReceiptPrintWidth {
    return paperWidth === '58mm' ? '58mm' : '80mm';
  }

  private money(value: Prisma.Decimal | number | string) {
    return new Prisma.Decimal(value).toFixed(2);
  }

  private async nextSaleNumber(businessId: string, tx: Tx) {
    const date = new Date();
    const prefix = `SALE-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
    const count = await tx.sale.count({
      where: {
        businessId,
        saleNumber: { startsWith: prefix },
      },
    });

    return `${prefix}-${String(count + 1).padStart(6, '0')}`;
  }

  private buildWhere(
    businessId: string,
    query: SaleQueryDto,
  ): Prisma.SaleWhereInput {
    const search = query.search?.trim();

    return {
      businessId,
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.startDate || query.endDate
        ? {
            saleDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                saleNumber: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                remarks: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                customer: {
                  firstName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  lastName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                customer: {
                  phone: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async getSaleOrThrow(
    businessId: string,
    id: string,
    tx: Tx | PrismaService,
  ) {
    const sale = await tx.sale.findFirst({
      where: { id, businessId, deletedAt: null },
      include: this.saleInclude(),
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private saleInclude() {
    return {
      customer: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
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
      payments: true,
      receipt: {
        include: { items: true },
      },
    } satisfies Prisma.SaleInclude;
  }

  private receiptInclude() {
    return {
      items: { orderBy: { createdAt: 'asc' } },
      sale: {
        include: {
          business: { include: { receiptSettings: true } },
          customer: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
          items: {
            orderBy: { createdAt: 'asc' },
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
          payments: true,
        },
      },
    } satisfies Prisma.ReceiptInclude;
  }

  private async recordCashRegisterTransaction(
    tx: Tx,
    data: {
      businessId: string;
      userId: string;
      transactionType: CashTransactionType;
      amount: Prisma.Decimal;
      reference: string;
      description: string;
      transactionDate: Date;
    },
  ) {
    const register = await tx.cashRegister.findFirst({
      where: {
        businessId: data.businessId,
        userId: data.userId,
        status: CashRegisterStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
      select: { id: true, openingBalance: true, expectedBalance: true },
    });

    if (!register) {
      throw new BadRequestException(
        'Open cash register is required for cash sales',
      );
    }

    const currentBalance =
      register.expectedBalance ??
      (await this.calculateRegisterCashBalance(tx, register.id));
    const nextBalance = currentBalance.add(data.amount);

    await tx.cashRegisterTransaction.create({
      data: {
        cashRegisterId: register.id,
        transactionType: data.transactionType,
        amount: data.amount,
        reference: data.reference,
        description: data.description,
        transactionDate: data.transactionDate,
      },
    });

    await tx.cashRegister.update({
      where: { id: register.id },
      data: { expectedBalance: nextBalance },
    });
  }

  private async calculateRegisterCashBalance(tx: Tx, cashRegisterId: string) {
    const register = await tx.cashRegister.findUnique({
      where: { id: cashRegisterId },
      select: { openingBalance: true },
    });

    if (!register) {
      throw new NotFoundException('Cash register not found');
    }

    const transactions = await tx.cashRegisterTransaction.findMany({
      where: { cashRegisterId },
      select: { transactionType: true, amount: true },
    });
    const inflowTypes: CashTransactionType[] = [
      CashTransactionType.SALE,
      CashTransactionType.CREDIT_PAYMENT,
      CashTransactionType.CASH_IN,
    ];
    const outflowTypes: CashTransactionType[] = [
      CashTransactionType.EXPENSE,
      CashTransactionType.CASH_OUT,
    ];

    return transactions.reduce((balance, transaction) => {
      if (inflowTypes.includes(transaction.transactionType)) {
        return balance.add(transaction.amount);
      }

      if (outflowTypes.includes(transaction.transactionType)) {
        return balance.sub(transaction.amount);
      }

      return balance;
    }, new Prisma.Decimal(register.openingBalance));
  }

  private async audit(
    tx: Tx,
    data: {
      businessId: string;
      userId: string;
      action: AuditAction;
      entity: string;
      entityId: string;
      description: string;
      deviceId?: string;
    },
  ) {
    await tx.auditLog.create({
      data: {
        businessId: data.businessId,
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        description: data.description,
        deviceId: data.deviceId ?? null,
      },
    });
  }
}
