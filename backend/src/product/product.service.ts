import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductBarcodeDto } from './dto/create-product-barcode.dto';
import { ProductQueryDto } from './product-query.dto';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    dto: CreateProductDto,
    user?: AuthenticatedUser,
  ) {
    await this.ensureCategoryExists(businessId, dto.categoryId);
    await this.ensureUnitExists(businessId, dto.unitId);
    if (dto.brandId) {
      await this.ensureBrandExists(businessId, dto.brandId);
    }
    if (dto.supplierId) {
      await this.ensureSupplierExists(businessId, dto.supplierId);
    }
    this.validatePricesAndStock(dto);
    await this.validateUniqueSku(businessId, dto.sku);
    if (dto.barcode) {
      await this.validateUniqueBarcode(businessId, dto.barcode, undefined);
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          supplierId: dto.supplierId,
          unitId: dto.unitId,
          name: dto.name.trim(),
          sku: dto.sku.trim(),
          barcode: dto.barcode?.trim() || null,
          description: dto.description?.trim() || null,
          purchasePrice: dto.purchasePrice,
          sellingPrice: dto.sellingPrice,
          wholesalePrice: dto.wholesalePrice ?? null,
          minimumStock: dto.minimumStock ?? 0,
          maximumStock: dto.maximumStock ?? null,
          imageUrl: dto.imageUrl?.trim() || null,
          isActive: dto.isActive ?? true,
        },
      });

      await tx.inventory.create({
        data: {
          businessId,
          productId: product.id,
          quantityOnHand: 0,
          quantityReserved: 0,
          quantityAvailable: 0,
          reorderLevel: dto.minimumStock ?? 0,
          reorderQuantity: dto.minimumStock ?? 0,
          averageCost: dto.purchasePrice,
          lastStockUpdate: new Date(),
          isSynced: true,
          syncVersion: 1,
        },
      });

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
  }

  async findAll(businessId: string, query: ProductQueryDto = {}) {
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
              { category: { name: { contains: search, mode: 'insensitive' } } },
              { brand: { name: { contains: search, mode: 'insensitive' } } },
              { unit: { name: { contains: search, mode: 'insensitive' } } },
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

  async findOne(businessId: string, id: string) {
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

  async update(
    businessId: string,
    id: string,
    dto: UpdateProductDto,
    user?: AuthenticatedUser,
  ) {
    const current = await this.findOne(businessId, id);

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

    return this.prisma.$transaction(async (tx) => {
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
  }

  async remove(businessId: string, id: string, user?: AuthenticatedUser) {
    const current = await this.findOne(businessId, id);

    const inventory = await this.prisma.inventory.findFirst({
      where: { businessId, productId: id },
    });

    if (inventory && inventory.quantityAvailable > 0) {
      throw new BadRequestException(
        'Cannot delete product with remaining stock. Deactivate it instead.',
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
            description: `Deactivated product ${current.name}`,
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

  async searchByBarcode(businessId: string, barcode: string) {
    const normalized = barcode.trim();

    if (!normalized) {
      throw new BadRequestException('Barcode is required');
    }

    return this.prisma.product.findMany({
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
  }

  async searchBySku(businessId: string, sku: string) {
    const normalized = sku.trim();

    if (!normalized) {
      throw new BadRequestException('SKU is required');
    }

    return this.prisma.product.findMany({
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
  }

  async searchByCategory(businessId: string, categoryName: string) {
    const normalized = categoryName.trim();

    if (!normalized) {
      throw new BadRequestException('Category search value is required');
    }

    return this.prisma.product.findMany({
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
  }

  async searchByBrand(businessId: string, brandName: string) {
    const normalized = brandName.trim();

    if (!normalized) {
      throw new BadRequestException('Brand search value is required');
    }

    return this.prisma.product.findMany({
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
  }

  async searchByUnit(businessId: string, unitName: string) {
    const normalized = unitName.trim();

    if (!normalized) {
      throw new BadRequestException('Unit search value is required');
    }

    return this.prisma.product.findMany({
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
  }

  async findLowStockProducts(businessId: string) {
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

    return products.filter((product) => {
      const inventory = product.inventory;
      if (!inventory) {
        return false;
      }

      return inventory.quantityAvailable <= inventory.reorderLevel;
    });
  }

  async findAvailableProducts(businessId: string) {
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      include: {
        inventory: true,
        category: true,
        brand: true,
        unit: true,
      },
    });

    return products.filter((product) => {
      const inventory = product.inventory;
      return inventory ? inventory.quantityAvailable > 0 : false;
    });
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
    wholesalePrice?: number | null;
    minimumStock?: number;
    maximumStock?: number | null;
  }) {
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

  private async validateUniqueSku(
    businessId: string,
    sku: string,
    excludeId?: string,
  ): Promise<void> {
    const normalized = sku.trim();

    const existing = await this.prisma.product.findFirst({
      where: {
        businessId,
        sku: normalized,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
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
