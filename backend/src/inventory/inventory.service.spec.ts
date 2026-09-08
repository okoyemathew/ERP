import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CreditSaleStatus,
  InventoryTransactionType,
  NotificationType,
  PaymentStatus,
  Prisma,
  ProductReturnRequestStatus,
  SaleStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { InventoryService } from './inventory.service';

const businessId = '11111111-1111-1111-1111-111111111111';
const employeeUserId = '22222222-2222-2222-2222-222222222222';
const ownerUserId = '33333333-3333-3333-3333-333333333333';
const otherUserId = '44444444-4444-4444-4444-444444444444';
const productId = '55555555-5555-5555-5555-555555555555';
const saleId = '66666666-6666-6666-6666-666666666666';
const saleItemId = '77777777-7777-7777-7777-777777777777';
const customerId = '88888888-8888-8888-8888-888888888888';
const creditSaleId = '99999999-9999-9999-9999-999999999999';

const employee: AuthenticatedUser = {
  id: employeeUserId,
  username: 'matthew',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Cashier',
  employeeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
};

const owner: AuthenticatedUser = {
  id: ownerUserId,
  username: 'owner',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Owner',
  employeeId: null,
};

const admin: AuthenticatedUser = {
  ...owner,
  id: otherUserId,
  username: 'admin',
  roleName: 'Admin',
};

function user(id: string, roleName: string) {
  return {
    id,
    firstName: roleName,
    lastName: 'User',
    username: roleName.toLowerCase(),
    role: { name: roleName },
  };
}

function saleItemForSeller(
  sellerId = employeeUserId,
  roleName = 'Cashier',
  creditSale: Record<string, unknown> | null = null,
) {
  return {
    id: saleItemId,
    saleId,
    productId,
    quantity: 5,
    unitPrice: new Prisma.Decimal(100),
    discountAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(500),
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    product: { id: productId, name: 'Product X' },
    sale: {
      id: saleId,
      businessId,
      customerId,
      userId: sellerId,
      saleNumber: 'SALE-1001',
      status: SaleStatus.COMPLETED,
      saleDate: new Date('2026-09-01T10:00:00.000Z'),
      creditSale,
      customer: {
        id: customerId,
        firstName: 'John',
        lastName: 'Customer',
        companyName: null,
        phone: '5550100',
      },
      user: user(sellerId, roleName),
    },
  };
}

function pendingReturn(
  roleName = 'Cashier',
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    businessId,
    productId,
    saleId,
    saleItemId,
    creditSaleId: null,
    customerId,
    originalSellerId:
      roleName === 'Owner' ? ownerUserId : employeeUserId,
    requestedById: roleName === 'Owner' ? ownerUserId : employeeUserId,
    reviewedById: null,
    quantity: 2,
    unitCost: new Prisma.Decimal(100),
    referenceNumber: 'SALE-1001',
    remarks: 'Returned by customer',
    status: ProductReturnRequestStatus.PENDING,
    decisionNote: null,
    requestedAt: new Date('2026-09-02T10:00:00.000Z'),
    reviewedAt: null,
    inventoryTransactionId: null,
    createdAt: new Date('2026-09-02T10:00:00.000Z'),
    updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    product: {
      id: productId,
      name: 'Product X',
      sku: 'PX',
      barcode: null,
    },
    requestedBy: user(roleName === 'Owner' ? ownerUserId : employeeUserId, roleName),
    reviewedBy: null,
    originalSeller: user(roleName === 'Owner' ? ownerUserId : employeeUserId, roleName),
    customer: {
      id: customerId,
      firstName: 'John',
      lastName: 'Customer',
      companyName: null,
      phone: '5550100',
    },
    sale: {
      id: saleId,
      saleNumber: 'SALE-1001',
      saleDate: new Date('2026-09-01T10:00:00.000Z'),
      customerId,
      userId: roleName === 'Owner' ? ownerUserId : employeeUserId,
    },
    saleItem: {
      id: saleItemId,
      quantity: 5,
      unitPrice: new Prisma.Decimal(100),
      totalAmount: new Prisma.Decimal(500),
    },
    creditSale: null,
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma: any = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
    product: {
      findFirst: jest.fn().mockResolvedValue({ id: productId, businessId }),
    },
    inventory: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        businessId,
        productId,
        quantityOnHand: 10,
        quantityReserved: 0,
        quantityAvailable: 10,
        averageCost: new Prisma.Decimal(50),
        syncVersion: 1,
        deviceId: null,
      }),
      update: jest.fn().mockImplementation(({ data }: { data: any }) => ({
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        productId,
        ...data,
      })),
    },
    saleItem: {
      findFirst: jest.fn(),
    },
    productReturnRequest: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockImplementation(({ data }: { data: any }) => ({
        ...pendingReturn(),
        ...data,
      })),
    },
    creditSale: {
      update: jest.fn(),
    },
    sale: {
      update: jest.fn(),
    },
    customer: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ outstandingBalance: new Prisma.Decimal(70) }),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: ownerUserId }]),
    },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  return prisma;
}

function createService(prisma = createPrismaMock()) {
  const inventoryTransactionService = {
    createTransaction: jest.fn().mockResolvedValue({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    }),
  };
  const service = new InventoryService(
    prisma as never,
    inventoryTransactionService as never,
    {} as never,
  );

  return { service, prisma, inventoryTransactionService };
}

describe('InventoryService product returns', () => {
  it('lets the original employee seller create a pending return linked to the sale item', async () => {
    const { service, prisma } = createService();
    const item = saleItemForSeller();
    prisma.saleItem.findFirst.mockResolvedValue(item);
    prisma.productReturnRequest.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...pendingReturn(),
        ...data,
      }),
    );

    await service.createReturnRequest(
      businessId,
      {
        productId,
        saleItemId,
        quantity: 2,
        referenceNumber: 'SALE-1001',
      },
      employee,
    );

    expect(prisma.productReturnRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId,
          productId,
          saleId,
          saleItemId,
          customerId,
          originalSellerId: employeeUserId,
          requestedById: employeeUserId,
          quantity: 2,
          status: ProductReturnRequestStatus.PENDING,
        }),
      }),
    );
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: ownerUserId,
            type: NotificationType.INFO,
          }),
        ]),
      }),
    );
  });

  it('rejects return initiation by someone who was not the original seller', async () => {
    const { service, prisma } = createService();
    prisma.saleItem.findFirst.mockResolvedValue(saleItemForSeller());

    await expect(
      service.createReturnRequest(
        businessId,
        { productId, saleItemId, quantity: 1 },
        { ...employee, id: otherUserId },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.productReturnRequest.create).not.toHaveBeenCalled();
  });

  it('rejects returns above the remaining quantity for that sale item', async () => {
    const { service, prisma } = createService();
    prisma.saleItem.findFirst.mockResolvedValue(saleItemForSeller());
    prisma.productReturnRequest.aggregate.mockResolvedValue({
      _sum: { quantity: 4 },
    });

    await expect(
      service.createReturnRequest(
        businessId,
        { productId, saleItemId, quantity: 2 },
        employee,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productReturnRequest.create).not.toHaveBeenCalled();
  });

  it('lets the business owner see employee return requests across customer ownership boundaries', async () => {
    const { service, prisma } = createService();
    const request = pendingReturn('Cashier');
    prisma.productReturnRequest.count.mockResolvedValue(1);
    prisma.productReturnRequest.findMany.mockResolvedValue([request]);

    const result = await service.findReturnRequests(
      businessId,
      { status: ProductReturnRequestStatus.PENDING },
      owner,
    );

    expect(result.data).toEqual([request]);
    const findManyArgs = prisma.productReturnRequest.findMany.mock.calls[0][0];
    expect(findManyArgs.where).toEqual({
      businessId,
      status: ProductReturnRequestStatus.PENDING,
    });
  });

  it('lets admins see employee return requests for owner-side approval', async () => {
    const { service, prisma } = createService();
    const request = pendingReturn('Cashier');
    prisma.productReturnRequest.count.mockResolvedValue(1);
    prisma.productReturnRequest.findMany.mockResolvedValue([request]);

    const result = await service.findReturnRequests(
      businessId,
      { status: ProductReturnRequestStatus.PENDING },
      admin,
    );

    expect(result.data).toEqual([request]);
    const findManyArgs = prisma.productReturnRequest.findMany.mock.calls[0][0];
    expect(findManyArgs.where).toEqual({
      businessId,
      status: ProductReturnRequestStatus.PENDING,
    });
  });

  it('keeps employees scoped to returns they requested or originally sold', async () => {
    const { service, prisma } = createService();
    prisma.productReturnRequest.count.mockResolvedValue(0);
    prisma.productReturnRequest.findMany.mockResolvedValue([]);

    await service.findReturnRequests(
      businessId,
      { status: ProductReturnRequestStatus.PENDING },
      employee,
    );

    const findManyArgs = prisma.productReturnRequest.findMany.mock.calls[0][0];
    expect(findManyArgs.where).toEqual({
      businessId,
      AND: [
        {
          OR: [
            { requestedById: employeeUserId },
            { originalSellerId: employeeUserId },
          ],
        },
      ],
      status: ProductReturnRequestStatus.PENDING,
    });
  });

  it('approves an employee return without adding stock to main inventory', async () => {
    const { service, prisma, inventoryTransactionService } = createService();
    prisma.productReturnRequest.findFirst.mockResolvedValue(
      pendingReturn('Cashier'),
    );

    await service.approveReturnRequest(businessId, pendingReturn().id, {}, owner);

    expect(prisma.inventory.update).not.toHaveBeenCalled();
    expect(inventoryTransactionService.createTransaction).not.toHaveBeenCalled();
    expect(prisma.productReturnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ProductReturnRequestStatus.APPROVED,
          reviewedById: ownerUserId,
        }),
      }),
    );
    expect(prisma.sale.update).toHaveBeenCalledWith({
      where: { id: saleId },
      data: { status: SaleStatus.REFUNDED },
    });
  });

  it('allows additional return requests from sales already marked refunded', async () => {
    const { service, prisma } = createService();
    const item = saleItemForSeller();
    item.sale.status = SaleStatus.REFUNDED;
    prisma.saleItem.findFirst.mockResolvedValue(item);
    prisma.productReturnRequest.create.mockImplementation(
      ({ data }: { data: any }) => pendingReturn('Cashier', data),
    );

    await service.createReturnRequest(
      businessId,
      { productId, saleItemId, quantity: 1 },
      employee,
    );

    expect(prisma.saleItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sale: expect.objectContaining({
            status: { in: [SaleStatus.COMPLETED, SaleStatus.REFUNDED] },
          }),
        }),
      }),
    );
    expect(prisma.productReturnRequest.create).toHaveBeenCalled();
  });

  it('rejects an employee return without adding stock anywhere', async () => {
    const { service, prisma } = createService();
    prisma.productReturnRequest.findFirst.mockResolvedValue(
      pendingReturn('Cashier'),
    );

    await service.rejectReturnRequest(businessId, pendingReturn().id, {}, owner);

    expect(prisma.inventory.update).not.toHaveBeenCalled();
    expect(prisma.productReturnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ProductReturnRequestStatus.REJECTED,
          reviewedById: ownerUserId,
        }),
      }),
    );
  });

  it('approves an owner-sold return back into main owner inventory', async () => {
    const { service, prisma, inventoryTransactionService } = createService();
    prisma.productReturnRequest.findFirst.mockResolvedValue(
      pendingReturn('Owner'),
    );

    await service.approveReturnRequest(
      businessId,
      pendingReturn('Owner').id,
      {},
      owner,
    );

    expect(prisma.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantityOnHand: 12,
          quantityAvailable: 12,
        }),
      }),
    );
    expect(inventoryTransactionService.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: InventoryTransactionType.RETURN,
        quantity: 2,
        quantityBefore: 10,
        quantityAfter: 12,
      }),
      prisma,
    );
  });

  it('adjusts credit balance without deleting payment history when approved', async () => {
    const { service, prisma } = createService();
    prisma.productReturnRequest.findFirst.mockResolvedValue(
      pendingReturn('Cashier', {
        creditSaleId,
        creditSale: {
          id: creditSaleId,
          totalCredit: new Prisma.Decimal(100),
          amountPaid: new Prisma.Decimal(40),
          balance: new Prisma.Decimal(60),
          dueDate: null,
          status: CreditSaleStatus.PARTIALLY_PAID,
        },
      }),
    );

    await service.approveReturnRequest(businessId, pendingReturn().id, {}, owner);

    expect(prisma.creditSale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: creditSaleId },
        data: expect.objectContaining({
          totalCredit: new Prisma.Decimal(40),
          balance: new Prisma.Decimal(0),
          status: CreditSaleStatus.PAID,
        }),
      }),
    );
    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outstandingBalance: new Prisma.Decimal(10),
        }),
      }),
    );
    expect((prisma as any).payment?.deleteMany).toBeUndefined();
    expect((prisma as any).creditPayment?.deleteMany).toBeUndefined();
  });

  it('prevents employees from approving their own pending returns', async () => {
    const { service, prisma } = createService();

    await expect(
      service.approveReturnRequest(businessId, pendingReturn().id, {}, employee),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.productReturnRequest.findFirst).not.toHaveBeenCalled();
  });

  it('does not approve the same return twice', async () => {
    const { service, prisma } = createService();
    prisma.productReturnRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.approveReturnRequest(businessId, pendingReturn().id, {}, owner),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inventory.update).not.toHaveBeenCalled();
    expect(prisma.productReturnRequest.update).not.toHaveBeenCalled();
  });
});
