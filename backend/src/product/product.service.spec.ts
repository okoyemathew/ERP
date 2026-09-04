import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductService } from './product.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const productId = '22222222-2222-2222-2222-222222222222';
const categoryId = '33333333-3333-3333-3333-333333333333';
const unitId = '44444444-4444-4444-4444-444444444444';

function authUser(roleName: string): AuthenticatedUser {
  return {
    id: `${roleName.toLowerCase()}-user`,
    username: roleName.toLowerCase(),
    businessId,
    branchId: null,
    roleId: null,
    roleName,
    employeeId: null,
  };
}

function product(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-08-28T10:00:00.000Z');

  return {
    id: productId,
    businessId,
    categoryId,
    brandId: null,
    supplierId: null,
    unitId,
    name: 'Cement',
    sku: 'CEM-001',
    barcode: null,
    description: null,
    purchasePrice: new Prisma.Decimal(8000),
    sellingPrice: new Prisma.Decimal(10500),
    baseSellingPrice: new Prisma.Decimal(10000),
    wholesalePrice: null,
    minimumStock: 0,
    maximumStock: null,
    imageUrl: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    category: { id: categoryId, name: 'Building' },
    brand: null,
    supplier: null,
    unit: { id: unitId, name: 'Bag', symbol: 'bag' },
    inventory: null,
    images: [],
    barcodes: [],
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma: any = {};

  Object.assign(prisma, {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    category: { findFirst: jest.fn() },
    unit: { findFirst: jest.fn() },
    brand: { findFirst: jest.fn() },
    supplier: { findFirst: jest.fn() },
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventory: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    inventoryTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  });

  return prisma;
}

describe('ProductService base selling price', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: ProductService;
  const owner = authUser('Owner');
  const employee = authUser('Inventory Officer');

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ProductService(prisma as never);
    prisma.category.findFirst.mockResolvedValue({ id: categoryId, businessId });
    prisma.category.upsert = jest.fn().mockResolvedValue({
      id: categoryId,
      businessId,
      name: 'Uncategorized',
    });
    prisma.unit.findFirst.mockResolvedValue({ id: unitId, businessId });
    prisma.unit.upsert = jest.fn().mockResolvedValue({
      id: unitId,
      businessId,
      name: 'Unit',
      symbol: 'UNIT',
    });
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.inventoryTransaction.findMany.mockResolvedValue([]);
  });

  it('allows the owner to create a product with base selling price', async () => {
    const created = product();
    prisma.product.create.mockResolvedValue(created);
    prisma.product.findUnique.mockResolvedValue(created);
    prisma.inventory.create.mockResolvedValue({});

    const result = await service.create(
      businessId,
      {
        categoryId,
        unitId,
        name: 'Cement',
        sku: 'CEM-001',
        purchasePrice: 8000,
        sellingPrice: 10500,
        baseSellingPrice: 10000,
        minimumStock: 0,
      },
      owner,
    );

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sellingPrice: 10500,
          baseSellingPrice: 10000,
        }),
      }),
    );
    expect(result).toHaveProperty('baseSellingPrice');
  });

  it('defaults base selling price to selling price when omitted', async () => {
    const created = product({ baseSellingPrice: new Prisma.Decimal(10500) });
    prisma.product.create.mockResolvedValue(created);
    prisma.product.findUnique.mockResolvedValue(created);
    prisma.inventory.create.mockResolvedValue({});

    await service.create(
      businessId,
      {
        categoryId,
        unitId,
        name: 'Cement',
        sku: 'CEM-001',
        purchasePrice: 8000,
        sellingPrice: 10500,
        minimumStock: 0,
      },
      owner,
    );

    expect(prisma.product.create.mock.calls[0][0].data.baseSellingPrice).toBe(10500);
  });

  it('creates a product when only name and stock limit are supplied', async () => {
    const created = product({
      name: 'Roof Sheet',
      sku: 'ROOF-SHEET',
      purchasePrice: new Prisma.Decimal(0),
      sellingPrice: new Prisma.Decimal(0),
      baseSellingPrice: new Prisma.Decimal(0),
      minimumStock: 12,
    });
    prisma.product.create.mockResolvedValue(created);
    prisma.product.findUnique.mockResolvedValue(created);
    prisma.inventory.create.mockResolvedValue({});

    await service.create(
      businessId,
      {
        name: 'Roof Sheet',
        minimumStock: 12,
      },
      owner,
    );

    expect(prisma.category.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId_name: { businessId, name: 'Uncategorized' } },
      }),
    );
    expect(prisma.unit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId_symbol: { businessId, symbol: 'UNIT' } },
      }),
    );
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId,
          unitId,
          name: 'Roof Sheet',
          sku: 'ROOF-SHEET',
          purchasePrice: 0,
          sellingPrice: 0,
          baseSellingPrice: 0,
          minimumStock: 12,
        }),
      }),
    );
    expect(prisma.inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reorderLevel: 12,
          reorderQuantity: 12,
        }),
      }),
    );
  });

  it('removes base selling price from employee product responses', async () => {
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([product()]);

    const response = await service.findAll(businessId, {}, employee);

    expect(response.data[0]).not.toHaveProperty('baseSellingPrice');
  });

  it('keeps base selling price in owner product responses', async () => {
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([product()]);

    const response = await service.findAll(businessId, {}, owner);

    expect(response.data[0]).toHaveProperty('baseSellingPrice');
  });

  it('allows the owner to update base selling price', async () => {
    prisma.product.findFirst
      .mockResolvedValueOnce(product())
      .mockResolvedValueOnce(null);
    prisma.product.update.mockResolvedValue(
      product({ baseSellingPrice: new Prisma.Decimal(11000) }),
    );

    const response = await service.update(
      businessId,
      productId,
      { sellingPrice: 12000, baseSellingPrice: 11000 },
      owner,
    );

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          baseSellingPrice: 11000,
        }),
      }),
    );
    expect(response).toHaveProperty('baseSellingPrice');
    expect(
      Number((response as unknown as { baseSellingPrice: Prisma.Decimal }).baseSellingPrice),
    ).toBe(11000);
  });

  it('rejects non-owner base selling price updates', async () => {
    prisma.product.findFirst.mockResolvedValue(product());

    await expect(
      service.update(
        businessId,
        productId,
        { baseSellingPrice: 9000 },
        employee,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});
