import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, InventoryTransactionType, Prisma } from '@prisma/client';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductBarcodeDto } from './dto/create-product-barcode.dto';
import { ProductQueryDto } from './product-query.dto';

const DEFAULT_PRODUCT_CATEGORY_NAME = 'Uncategorized';
const DEFAULT_PRODUCT_UNIT_NAME = 'Unit';
const DEFAULT_PRODUCT_UNIT_SYMBOL = 'UNIT';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    dto: CreateProductDto,
    user?: AuthenticatedUser,
  ) {
    const name = dto.name.trim();
    const categoryId = await this.resolveCategoryId(businessId, dto.categoryId);
    const unitId = await this.resolveUnitId(businessId, dto.unitId);
    const sku = await this.resolveSku(businessId, name, dto.sku);
    const purchasePrice = dto.purchasePrice ?? 0;
    const sellingPrice =
      dto.sellingPrice ?? Math.max(dto.baseSellingPrice ?? 0, dto.wholesalePrice ?? 0);
    if (dto.brandId) {
      await this.ensureBrandExists(businessId, dto.brandId);
    }
    if (dto.supplierId) {
      await this.ensureSupplierExists(businessId, dto.supplierId);
    }
    this.validatePricesAndStock({
      purchasePrice,
      sellingPrice,
      baseSellingPrice: dto.baseSellingPrice,
      wholesalePrice: dto.wholesalePrice,
      minimumStock: dto.minimumStock,
      maximumStock: dto.maximumStock,
    });
    if (dto.barcode) {
      await this.validateUniqueBarcode(businessId, dto.barcode, undefined);
    }
    this.assertCanSetBaseSellingPrice(dto, user);

    const initialStock = dto.initialStock ?? dto.minimumStock;
    const baseSellingPrice = dto.baseSellingPrice ?? sellingPrice;

    const createdProduct = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId,
          categoryId,
          brandId: dto.brandId,
          supplierId: dto.supplierId,
          unitId,
          name,
          sku,
          barcode: dto.barcode?.trim() || null,
          description: dto.description?.trim() || null,
          purchasePrice,
          sellingPrice,
          baseSellingPrice,
          wholesalePrice: dto.wholesalePrice ?? null,
          minimumStock: dto.minimumStock,
          maximumStock: dto.maximumStock ?? null,
          imageUrl: dto.imageUrl?.trim() || null,
          isActive: dto.isActive ?? true,
        },
      });

      await tx.inventory.create({
        data: {
          businessId,
          productId: product.id,
          quantityOnHand: initialStock,
          quantityReserved: 0,
          quantityAvailable: initialStock,
          reorderLevel: dto.minimumStock,
          reorderQuantity: dto.minimumStock,
          averageCost: purchasePrice,
          lastStockUpdate: new Date(),
          isSynced: true,
          syncVersion: 1,
        },
      });

      if (initialStock > 0) {
        const inventory = await tx.inventory.findUniqueOrThrow({
          where: { productId: product.id },
        });

        await tx.inventoryTransaction.create({
          data: {
            businessId,
            inventoryId: inventory.id,
            productId: product.id,
            transactionType: InventoryTransactionType.STOCK_IN,
            quantity: initialStock,
            quantityBefore: 0,
            quantityAfter: initialStock,
            unitCost: purchasePrice,
            referenceNumber: `INITIAL_STOCK:${product.id}`,
            remarks: 'Initial stock on product creation',
            transactionDate: new Date(),
            isSynced: true,
            syncVersion: 1,
          },
        });
      }

      if (user) {
        await tx.auditLog.create({
          data: {
            businessId,
            userId: user.id,
            action: AuditAction.PRODUCT_CREATED,
            entity: 'Product',
            entityId: product.id,
            description: `Created product ${product.name}`,
          },
        });
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          brand: true,
          supplier: true,
          unit: true,
          images: true,
          barcodes: true,
          inventory: true,
        },
      });
    });

    const [createdProductWithMetadata] = await this.attachCreationMetadata(
      businessId,
      createdProduct ? [createdProduct] : [],
      user,
    );

    return createdProductWithMetadata ?? createdProduct;
  }

  async findAll(
    businessId: string,
    query: ProductQueryDto = {},
    viewer?: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const search = query.search?.trim();

    const where: Prisma.ProductWhereInput = {
      businessId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
              { barcodes: { some: { barcode: { contains: search } } } },
              { category: { name: { contains: search, mode: 'insensitive' } } },
              { brand: { name: { contains: search, mode: 'insensitive' } } },
              {
                supplier: {
                  companyName: { contains: search, mode: 'insensitive' },
                },
              },
              { unit: { name: { contains: search, mode: 'insensitive' } } },
              { unit: { symbol: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.category
        ? {
            category: {
              name: { contains: query.category.trim(), mode: 'insensitive' },
            },
          }
        : {}),
      ...(query.brand
        ? {
            brand: {
              name: { contains: query.brand.trim(), mode: 'insensitive' },
            },
          }
        : {}),
      ...(query.supplier
        ? {
            supplier: {
              companyName: {
                contains: query.supplier.trim(),
                mode: 'insensitive',
              },
            },
          }
        : {}),
      ...(query.unit
        ? {
            unit: {
              OR: [
                { name: { contains: query.unit.trim(), mode: 'insensitive' } },
                {
                  symbol: { contains: query.unit.trim(), mode: 'insensitive' },
                },
              ],
            },
          }
        : {}),
      ...(query.lowStock
        ? {
            inventory: {
              quantityAvailable: { lte: 0 },
            },
          }
        : {}),
      ...(query.available
        ? { inventory: { quantityAvailable: { gt: 0 } } }
        : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sortBy === 'quantityAvailable'
        ? { inventory: { quantityAvailable: sortOrder } }
        : { [sortBy]: sortOrder };

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          supplier: true,
          unit: true,
          images: true,
          barcodes: true,
          inventory: true,
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const data = await this.attachCreationMetadata(businessId, items, viewer);

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

  async findOne(
    businessId: string,
    id: string,
    viewer?: AuthenticatedUser,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
      include: {
        category: true,
        brand: true,
        supplier: true,
        unit: true,
        images: true,
        barcodes: true,
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [productWithMetadata] = await this.attachCreationMetadata(businessId, [
      product,
    ], viewer);

    return productWithMetadata;
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateProductDto,
    user?: AuthenticatedUser,
  ) {
    const current = await this.findProductOrThrow(businessId, id);
    this.assertCanSetBaseSellingPrice(dto, user);

    if (dto.categoryId) {
      await this.ensureCategoryExists(businessId, dto.categoryId);
    }
    if (dto.unitId) {
      await this.ensureUnitExists(businessId, dto.unitId);
    }
    if (dto.brandId) {
      await this.ensureBrandExists(businessId, dto.brandId);
    }
    if (dto.supplierId) {
      await this.ensureSupplierExists(businessId, dto.supplierId);
    }
    this.validatePricesAndStock({
      purchasePrice: dto.purchasePrice ?? Number(current.purchasePrice),
      sellingPrice: dto.sellingPrice ?? Number(current.sellingPrice),
      baseSellingPrice:
        dto.baseSellingPrice !== undefined
          ? dto.baseSellingPrice
          : Number(current.baseSellingPrice),
      wholesalePrice:
        dto.wholesalePrice !== undefined
          ? dto.wholesalePrice
          : current.wholesalePrice
            ? Number(current.wholesalePrice)
            : undefined,
      minimumStock: dto.minimumStock ?? current.minimumStock,
      maximumStock:
        dto.maximumStock !== undefined
          ? dto.maximumStock
          : current.maximumStock,
    });
    if (dto.sku) {
      await this.validateUniqueSku(businessId, dto.sku, id);
    }
    if (dto.barcode) {
      await this.validateUniqueBarcode(businessId, dto.barcode, id);
    }

    const updatedProduct = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          supplierId:
            dto.supplierId !== undefined ? dto.supplierId || null : undefined,
          unitId: dto.unitId,
          name: dto.name?.trim(),
          sku: dto.sku?.trim(),
          barcode:
            dto.barcode !== undefined ? dto.barcode?.trim() || null : undefined,
          description:
            dto.description !== undefined
              ? dto.description?.trim() || null
              : undefined,
          purchasePrice: dto.purchasePrice,
          sellingPrice: dto.sellingPrice,
          baseSellingPrice: dto.baseSellingPrice,
          wholesalePrice:
            dto.wholesalePrice !== undefined
              ? (dto.wholesalePrice ?? null)
              : undefined,
          minimumStock: dto.minimumStock,
          maximumStock: dto.maximumStock,
          imageUrl:
            dto.imageUrl !== undefined
              ? dto.imageUrl?.trim() || null
              : undefined,
          isActive: dto.isActive,
        },
        include: {
          category: true,
          brand: true,
          supplier: true,
          unit: true,
          inventory: true,
          images: true,
          barcodes: true,
        },
      });

      if (user) {
        await tx.auditLog.create({
          data: {
            businessId,
            userId: user.id,
            action: AuditAction.PRODUCT_UPDATED,
            entity: 'Product',
            entityId: product.id,
            description: `Updated product ${product.name}`,
          },
        });
      }

      return product;
    });

    const [updatedProductWithMetadata] = await this.attachCreationMetadata(
      businessId,
      [updatedProduct],
      user,
    );

    return updatedProductWithMetadata;
  }

  async remove(businessId: string, id: string, user?: AuthenticatedUser) {
    const current = await this.findOne(businessId, id);
    const isOwner =
      user?.roleName?.trim().toLowerCase() === SYSTEM_ROLES.OWNER.toLowerCase();

    const inventory = await this.prisma.inventory.findFirst({
      where: { businessId, productId: id },
    });

    if (!isOwner && inventory && inventory.quantityAvailable > 0) {
      throw new BadRequestException(
        'Only the owner can delete a product with remaining stock.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: { isActive: false },
      });

      if (user) {
        await tx.auditLog.create({
          data: {
            businessId,
            userId: user.id,
            action: AuditAction.PRODUCT_DELETED,
            entity: 'Product',
            entityId: id,
            description: `Deleted product ${current.name}`,
          },
        });
      }

      return product;
    });
  }

  async addImage(
    businessId: string,
    productId: string,
    dto: CreateProductImageDto,
  ) {
    await this.findOne(businessId, productId);

    return this.prisma.productImage.create({
      data: {
        productId,
        imageUrl: dto.imageUrl.trim(),
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async setPrimaryImage(
    businessId: string,
    productId: string,
    imageId: string,
  ) {
    await this.findOne(businessId, productId);

    await this.prisma.productImage.updateMany({
      where: { productId },
      data: { isPrimary: false },
    });

    return this.prisma.productImage.update({
      where: { id: imageId, productId },
      data: { isPrimary: true },
    });
  }

  async addBarcode(
    businessId: string,
    productId: string,
    dto: CreateProductBarcodeDto,
  ) {
    await this.findOne(businessId, productId);
    await this.validateUniqueBarcode(businessId, dto.barcode, undefined);

    return this.prisma.productBarcode.create({
      data: {
        productId,
        barcode: dto.barcode.trim(),
        barcodeType: dto.barcodeType?.trim() || null,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async removeImage(businessId: string, productId: string, imageId: string) {
    await this.findOne(businessId, productId);

    return this.prisma.productImage.delete({
      where: { id: imageId, productId },
    });
  }

  async removeBarcode(
    businessId: string,
    productId: string,
    barcodeId: string,
  ) {
    await this.findOne(businessId, productId);

    return this.prisma.productBarcode.delete({
      where: { id: barcodeId, productId },
    });
  }

  async searchByBarcode(
    businessId: string,
    barcode: string,
    viewer?: AuthenticatedUser,
  ) {
    const normalized = barcode.trim();

    if (!normalized) {
      throw new BadRequestException('Barcode is required');
    }

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { barcode: normalized },
          { barcodes: { some: { barcode: normalized } } },
        ],
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        unit: true,
        inventory: true,
      },
    });

    return this.attachCreationMetadata(businessId, products, viewer);
  }

  async searchBySku(
    businessId: string,
    sku: string,
    viewer?: AuthenticatedUser,
  ) {
    const normalized = sku.trim();

    if (!normalized) {
      throw new BadRequestException('SKU is required');
    }

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        sku: { contains: normalized, mode: 'insensitive' },
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        unit: true,
        inventory: true,
      },
      orderBy: { sku: 'asc' },
    });

    return this.attachCreationMetadata(businessId, products, viewer);
  }

  async searchByCategory(
    businessId: string,
    categoryName: string,
    viewer?: AuthenticatedUser,
  ) {
    const normalized = categoryName.trim();

    if (!normalized) {
      throw new BadRequestException('Category search value is required');
    }

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        category: { name: { contains: normalized, mode: 'insensitive' } },
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        unit: true,
        inventory: true,
      },
    });

    return this.attachCreationMetadata(businessId, products, viewer);
  }

  async searchByBrand(
    businessId: string,
    brandName: string,
    viewer?: AuthenticatedUser,
  ) {
    const normalized = brandName.trim();

    if (!normalized) {
      throw new BadRequestException('Brand search value is required');
    }

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        brand: { name: { contains: normalized, mode: 'insensitive' } },
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        unit: true,
        inventory: true,
      },
    });

    return this.attachCreationMetadata(businessId, products, viewer);
  }

  async searchByUnit(
    businessId: string,
    unitName: string,
    viewer?: AuthenticatedUser,
  ) {
    const normalized = unitName.trim();

    if (!normalized) {
      throw new BadRequestException('Unit search value is required');
    }

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        unit: {
          OR: [
            { name: { contains: normalized, mode: 'insensitive' } },
            { symbol: { contains: normalized, mode: 'insensitive' } },
          ],
        },
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        unit: true,
        inventory: true,
      },
    });

    return this.attachCreationMetadata(businessId, products, viewer);
  }

  async findLowStockProducts(
    businessId: string,
    viewer?: AuthenticatedUser,
  ) {
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      include: {
        inventory: true,
        category: true,
        brand: true,
        supplier: true,
        unit: true,
      },
    });

    const lowStockProducts = products.filter((product) => {
      const inventory = product.inventory;
      if (!inventory) {
        return false;
      }

      return inventory.quantityAvailable <= inventory.reorderLevel;
    });

    return this.attachCreationMetadata(businessId, lowStockProducts, viewer);
  }

  async findAvailableProducts(
    businessId: string,
    viewer?: AuthenticatedUser,
  ) {
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      include: {
        inventory: true,
        category: true,
        brand: true,
        unit: true,
      },
    });

    const availableProducts = products.filter((product) => {
      const inventory = product.inventory;
      return inventory ? inventory.quantityAvailable > 0 : false;
    });

    return this.attachCreationMetadata(businessId, availableProducts, viewer);
  }

  private async attachCreationMetadata<T extends { id: string; createdAt: Date }>(
    businessId: string,
    products: T[],
    viewer?: AuthenticatedUser,
  ) {
    if (products.length === 0) {
      return [];
    }

    const productIds = products.map((product) => product.id);
    const canViewAddedBy = this.canViewProductCreator(viewer);
    const [creationLogs, initialStockTransactions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          businessId,
          action: AuditAction.PRODUCT_CREATED,
          entity: 'Product',
          entityId: { in: productIds },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.inventoryTransaction.findMany({
        where: {
          businessId,
          productId: { in: productIds },
          transactionType: InventoryTransactionType.STOCK_IN,
          referenceNumber: { startsWith: 'INITIAL_STOCK:' },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const creationLogByProductId = new Map(
      creationLogs.map((log) => [log.entityId, log]),
    );
    const initialStockByProductId = new Map(
      initialStockTransactions.map((transaction) => [
        transaction.productId,
        transaction.quantity,
      ]),
    );

    return products.map((product) => {
      const creationLog = creationLogByProductId.get(product.id);

      return this.serializeProduct(
        {
          ...product,
          addedAt: creationLog?.createdAt ?? product.createdAt,
          addedBy: canViewAddedBy ? (creationLog?.user ?? null) : null,
          initialStockQuantity: initialStockByProductId.get(product.id) ?? 0,
        },
        viewer,
      );
    });
  }

  private canViewProductCreator(viewer?: AuthenticatedUser): boolean {
    return (
      viewer?.roleName === SYSTEM_ROLES.OWNER ||
      viewer?.roleName === SYSTEM_ROLES.ADMIN
    );
  }

  private canViewBaseSellingPrice(viewer?: AuthenticatedUser): boolean {
    return viewer?.roleName === SYSTEM_ROLES.OWNER;
  }

  private serializeProduct<T extends Record<string, unknown>>(
    product: T,
    viewer?: AuthenticatedUser,
  ) {
    if (this.canViewBaseSellingPrice(viewer)) {
      return product;
    }

    const { baseSellingPrice: _baseSellingPrice, ...safeProduct } = product;
    return safeProduct;
  }

  private assertCanSetBaseSellingPrice(
    dto: { baseSellingPrice?: number },
    user?: AuthenticatedUser,
  ) {
    if (
      dto.baseSellingPrice !== undefined &&
      user?.roleName !== SYSTEM_ROLES.OWNER
    ) {
      throw new ForbiddenException(
        'Only the owner can manage base selling price',
      );
    }
  }

  private async findProductOrThrow(businessId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
      include: {
        category: true,
        brand: true,
        supplier: true,
        unit: true,
        images: true,
        barcodes: true,
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async ensureCategoryExists(businessId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, businessId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private async ensureBrandExists(businessId: string, brandId: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, businessId },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
  }

  private async ensureUnitExists(businessId: string, unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, businessId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
  }

  private async ensureSupplierExists(businessId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
  }

  private validatePricesAndStock(dto: {
    purchasePrice?: number;
    sellingPrice?: number;
    baseSellingPrice?: number;
    wholesalePrice?: number | null;
    minimumStock?: number;
    maximumStock?: number | null;
  }) {
    if (
      dto.baseSellingPrice !== undefined &&
      dto.sellingPrice !== undefined &&
      dto.sellingPrice < dto.baseSellingPrice
    ) {
      throw new BadRequestException(
        'Selling price cannot be lower than base selling price',
      );
    }

    if (
      dto.wholesalePrice !== undefined &&
      dto.wholesalePrice !== null &&
      dto.sellingPrice !== undefined &&
      dto.wholesalePrice > dto.sellingPrice
    ) {
      throw new BadRequestException(
        'Wholesale price cannot be greater than selling price',
      );
    }

    if (
      dto.maximumStock !== undefined &&
      dto.maximumStock !== null &&
      dto.minimumStock !== undefined &&
      dto.maximumStock < dto.minimumStock
    ) {
      throw new BadRequestException(
        'Maximum stock cannot be lower than minimum stock',
      );
    }
  }

  private async resolveCategoryId(
    businessId: string,
    categoryId?: string,
  ): Promise<string> {
    if (categoryId) {
      await this.ensureCategoryExists(businessId, categoryId);
      return categoryId;
    }

    const category = await this.prisma.category.upsert({
      where: {
        businessId_name: {
          businessId,
          name: DEFAULT_PRODUCT_CATEGORY_NAME,
        },
      },
      update: { isActive: true },
      create: {
        businessId,
        name: DEFAULT_PRODUCT_CATEGORY_NAME,
        code: 'UNCATEGORIZED',
        description: 'Default category for products without a selected category',
        isActive: true,
      },
    });

    return category.id;
  }

  private async resolveUnitId(
    businessId: string,
    unitId?: string,
  ): Promise<string> {
    if (unitId) {
      await this.ensureUnitExists(businessId, unitId);
      return unitId;
    }

    const unit = await this.prisma.unit.upsert({
      where: {
        businessId_symbol: {
          businessId,
          symbol: DEFAULT_PRODUCT_UNIT_SYMBOL,
        },
      },
      update: { isActive: true },
      create: {
        businessId,
        name: DEFAULT_PRODUCT_UNIT_NAME,
        symbol: DEFAULT_PRODUCT_UNIT_SYMBOL,
        description: 'Default unit for products without a selected unit',
        isActive: true,
      },
    });

    return unit.id;
  }

  private async resolveSku(
    businessId: string,
    name: string,
    sku?: string,
  ): Promise<string> {
    const normalized = sku?.trim();

    if (normalized) {
      await this.validateUniqueSku(businessId, normalized);
      return normalized;
    }

    return this.generateUniqueSku(businessId, name);
  }

  private async generateUniqueSku(
    businessId: string,
    name: string,
  ): Promise<string> {
    const base =
      name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'PRODUCT';
    let candidate = base;
    let suffix = 1;

    while (await this.productSkuExists(businessId, candidate)) {
      suffix += 1;
      const suffixText = `-${suffix}`;
      candidate = `${base.slice(0, 80 - suffixText.length)}${suffixText}`;
    }

    return candidate;
  }

  private async productSkuExists(
    businessId: string,
    sku: string,
    excludeId?: string,
  ): Promise<boolean> {
    const existing = await this.prisma.product.findFirst({
      where: {
        businessId,
        sku,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    return Boolean(existing);
  }

  private async validateUniqueSku(
    businessId: string,
    sku: string,
    excludeId?: string,
  ): Promise<void> {
    const normalized = sku.trim();

    if (await this.productSkuExists(businessId, normalized, excludeId)) {
      throw new ConflictException('SKU already exists for this business');
    }
  }

  private async validateUniqueBarcode(
    businessId: string,
    barcode: string,
    excludeProductId?: string,
  ): Promise<void> {
    const normalized = barcode.trim();

    const existingProduct = await this.prisma.product.findFirst({
      where: {
        businessId,
        barcode: normalized,
        ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      },
    });

    if (existingProduct) {
      throw new ConflictException('Barcode already exists for this business');
    }

    const existingBarcode = await this.prisma.productBarcode.findFirst({
      where: {
        barcode: normalized,
        product: {
          businessId,
          ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
        },
      },
    });

    if (existingBarcode) {
      throw new ConflictException('Barcode already exists for this business');
    }
  }
}
