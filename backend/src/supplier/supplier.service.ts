import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    dto: CreateSupplierDto,
    user?: AuthenticatedUser,
  ) {
    const trimmedEmail = dto.email?.trim();
    const trimmedPhone = dto.phone.trim();
    const trimmedCompanyName = dto.companyName.trim();

    const existing = await this.prisma.supplier.findFirst({
      where: {
        businessId,
        OR: [
          ...(trimmedEmail ? [{ email: trimmedEmail }] : []),
          { phone: trimmedPhone },
          { companyName: { equals: trimmedCompanyName, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Supplier with the same company name, email, or phone already exists',
      );
    }

    const supplier = await this.prisma.supplier.create({
      data: {
        businessId,
        supplierCode: dto.supplierCode?.trim() || null,
        companyName: trimmedCompanyName,
        contactPerson: dto.contactPerson?.trim() || null,
        email: trimmedEmail || null,
        phone: trimmedPhone,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        country: dto.country?.trim() || null,
        taxNumber: dto.taxNumber?.trim() || null,
        outstandingBalance: dto.outstandingBalance ?? 0,
        notes: dto.notes?.trim() || null,
        status: dto.status ?? SupplierStatus.ACTIVE,
        isSynced: true,
        syncVersion: 1,
        deviceId: dto.deviceId ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'CREATE',
        entity: 'Supplier',
        entityId: supplier.id,
        description: `Created supplier ${supplier.companyName}`,
        deviceId: dto.deviceId ?? null,
      },
    });

    return supplier;
  }

  async findAll(businessId: string, query: SupplierQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const search = query.search?.trim();

    const where: Prisma.SupplierWhereInput = {
      businessId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.isActive !== undefined
        ? {
            status: query.isActive
              ? SupplierStatus.ACTIVE
              : { not: SupplierStatus.ACTIVE },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { supplierCode: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        include: {
          purchaseOrders: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          goodsSupplied: {
            take: 5,
            orderBy: { createdAt: 'desc' },
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

  async findOne(businessId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        goodsSupplied: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  async search(businessId: string, term: string, query: SupplierQueryDto = {}) {
    const search = term.trim();
    if (!search) {
      return this.findAll(businessId, query);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, items] = await Promise.all([
      this.prisma.supplier.count({
        where: {
          businessId,
          deletedAt: null,
          OR: [
            { companyName: { contains: search, mode: 'insensitive' } },
            { supplierCode: { contains: search, mode: 'insensitive' } },
            { contactPerson: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.supplier.findMany({
        where: {
          businessId,
          deletedAt: null,
          OR: [
            { companyName: { contains: search, mode: 'insensitive' } },
            { supplierCode: { contains: search, mode: 'insensitive' } },
            { contactPerson: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        },
        orderBy: { companyName: 'asc' },
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
    dto: UpdateSupplierDto,
    user?: AuthenticatedUser,
  ) {
    const supplier = await this.findOne(businessId, id);

    if (dto.companyName && dto.companyName.trim() !== supplier.companyName) {
      const sameName = await this.prisma.supplier.findFirst({
        where: {
          businessId,
          companyName: { equals: dto.companyName.trim(), mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (sameName) {
        throw new BadRequestException(
          'A supplier with this company name already exists',
        );
      }
    }

    if (dto.phone && dto.phone.trim() !== supplier.phone) {
      const samePhone = await this.prisma.supplier.findFirst({
        where: {
          businessId,
          phone: dto.phone.trim(),
          id: { not: id },
        },
      });

      if (samePhone) {
        throw new BadRequestException(
          'A supplier with this phone number already exists',
        );
      }
    }

    const updatedSupplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        supplierCode:
          dto.supplierCode !== undefined
            ? dto.supplierCode.trim() || null
            : undefined,
        companyName: dto.companyName?.trim(),
        contactPerson:
          dto.contactPerson !== undefined
            ? dto.contactPerson.trim() || null
            : undefined,
        email: dto.email !== undefined ? dto.email.trim() || null : undefined,
        phone: dto.phone?.trim(),
        address:
          dto.address !== undefined ? dto.address.trim() || null : undefined,
        city: dto.city !== undefined ? dto.city.trim() || null : undefined,
        state: dto.state !== undefined ? dto.state.trim() || null : undefined,
        country:
          dto.country !== undefined ? dto.country.trim() || null : undefined,
        taxNumber:
          dto.taxNumber !== undefined
            ? dto.taxNumber.trim() || null
            : undefined,
        outstandingBalance: dto.outstandingBalance,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        status: dto.status,
        syncVersion: { increment: 1 },
        isSynced: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'UPDATE',
        entity: 'Supplier',
        entityId: id,
        description: `Updated supplier ${updatedSupplier.companyName}`,
        deviceId: dto.deviceId ?? null,
      },
    });

    return updatedSupplier;
  }

  async setStatus(
    businessId: string,
    id: string,
    status: SupplierStatus,
    user?: AuthenticatedUser,
  ) {
    const supplier = await this.findOne(businessId, id);

    const updatedSupplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        status,
        syncVersion: { increment: 1 },
        isSynced: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'UPDATE',
        entity: 'SupplierStatus',
        entityId: id,
        description: `Changed supplier ${supplier.companyName} status to ${status}`,
        deviceId: null,
      },
    });

    return updatedSupplier;
  }

  async activate(businessId: string, id: string, user?: AuthenticatedUser) {
    return this.setStatus(businessId, id, SupplierStatus.ACTIVE, user);
  }

  async deactivate(businessId: string, id: string, user?: AuthenticatedUser) {
    return this.setStatus(businessId, id, SupplierStatus.INACTIVE, user);
  }

  async getOutstandingBalance(businessId: string, id: string) {
    const supplier = await this.findOne(businessId, id);
    return {
      supplierId: supplier.id,
      companyName: supplier.companyName,
      outstandingBalance: supplier.outstandingBalance,
      status: supplier.status,
    };
  }

  async recordSupplierPayment(
    businessId: string,
    id: string,
    amount: number,
    reference: string,
    user?: AuthenticatedUser,
  ) {
    const supplier = await this.findOne(businessId, id);

    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const { Decimal } = await import('@prisma/client/runtime/library');
    const paymentAmount = new Decimal(amount);

    if (supplier.outstandingBalance.lt(paymentAmount)) {
      throw new BadRequestException(
        'Payment amount exceeds outstanding balance',
      );
    }

    const newBalance = supplier.outstandingBalance.sub(paymentAmount);

    const updatedSupplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        outstandingBalance: newBalance,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: user?.id ?? null,
        action: 'UPDATE',
        entity: 'SupplierPayment',
        entityId: id,
        description: `Payment of ${amount} recorded for supplier ${supplier.companyName} (Ref: ${reference})`,
        deviceId: null,
      },
    });

    return {
      supplierId: updatedSupplier.id,
      companyName: updatedSupplier.companyName,
      paymentAmount: amount,
      previousBalance: supplier.outstandingBalance.toNumber(),
      newBalance: updatedSupplier.outstandingBalance.toNumber(),
    };
  }

  async getPaymentHistory(businessId: string, id: string) {
    const supplier = await this.findOne(businessId, id);

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        businessId,
        entityId: id,
        entity: 'SupplierPayment',
        action: 'UPDATE',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      supplierId: supplier.id,
      companyName: supplier.companyName,
      currentOutstandingBalance: supplier.outstandingBalance.toNumber(),
      paymentHistory: auditLogs.map((log) => ({
        id: log.id,
        date: log.createdAt,
        description: log.description,
        recordedBy: log.userId,
      })),
    };
  }
}
