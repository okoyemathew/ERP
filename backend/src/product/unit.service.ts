import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, dto: CreateUnitDto) {
    await this.validateUniqueSymbol(businessId, dto.symbol);

    return this.prisma.unit.create({
      data: {
        businessId,
        name: dto.name.trim(),
        symbol: dto.symbol.trim().toUpperCase(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.unit.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(businessId: string, id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, businessId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return unit;
  }

  async update(businessId: string, id: string, dto: UpdateUnitDto) {
    await this.findOne(businessId, id);

    if (dto.symbol) {
      await this.validateUniqueSymbol(businessId, dto.symbol, id);
    }

    return this.prisma.unit.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        symbol: dto.symbol ? dto.symbol.trim().toUpperCase() : undefined,
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
      where: { businessId, unitId: id, isActive: true },
    });

    if (products > 0) {
      throw new BadRequestException(
        'Cannot delete unit because it is assigned to active products',
      );
    }

    return this.prisma.unit.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async validateUniqueSymbol(
    businessId: string,
    symbol: string,
    excludeId?: string,
  ): Promise<void> {
    const normalized = symbol.trim().toUpperCase();

    const existing = await this.prisma.unit.findFirst({
      where: {
        businessId,
        symbol: normalized,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException(
        'Unit symbol already exists for this business',
      );
    }
  }
}
