import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, dto: CreateCategoryDto) {
    await this.validateUniqueName(businessId, dto.name);

    return this.prisma.category.create({
      data: {
        businessId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.category.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(businessId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, businessId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(businessId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(businessId, id);

    if (dto.name) {
      await this.validateUniqueName(businessId, dto.name, id);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        code: dto.code !== undefined ? dto.code?.trim() || null : undefined,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : undefined,
        isActive: dto.isActive,
      },
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);

    const products = await this.prisma.product.count({
      where: { businessId, categoryId: id, isActive: true },
    });

    if (products > 0) {
      throw new BadRequestException(
        'Cannot delete category because it is assigned to active products',
      );
    }

    return this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async validateUniqueName(
    businessId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const normalized = name.trim();

    const existing = await this.prisma.category.findFirst({
      where: {
        businessId,
        name: normalized,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException('Category already exists for this business');
    }
  }
}
