import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, dto: CreateBrandDto) {
    await this.validateUniqueName(businessId, dto.name);

    return this.prisma.brand.create({
      data: {
        businessId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.brand.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(businessId: string, id: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, businessId },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    return brand;
  }

  async update(businessId: string, id: string, dto: UpdateBrandDto) {
    await this.findOne(businessId, id);

    if (dto.name) {
      await this.validateUniqueName(businessId, dto.name, id);
    }

    return this.prisma.brand.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
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
      where: { businessId, brandId: id, isActive: true },
    });

    if (products > 0) {
      throw new BadRequestException(
        'Cannot delete brand because it is assigned to active products',
      );
    }

    return this.prisma.brand.update({
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

    const existing = await this.prisma.brand.findFirst({
      where: {
        businessId,
        name: normalized,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException('Brand already exists for this business');
    }
  }
}
