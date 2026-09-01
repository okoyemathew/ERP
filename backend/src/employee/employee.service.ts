import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  EmployeeStatus,
  PaymentMethod,
  Prisma,
  SaleStatus,
  SessionStatus,
  UserStatus,
} from '@prisma/client';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { hashPassword } from '../auth/utils/password.util';
import { PrismaService } from '../prisma/prisma.service';
import { AssignEmployeeRoleDto } from './dto/assign-employee-role.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeActivityQueryDto } from './dto/employee-activity-query.dto';
import { EmployeeLoginAccessDto } from './dto/employee-login-access.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { EmployeeStatusDto } from './dto/employee-status.dto';
import { PermissionVerificationDto } from './dto/permission-verification.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

type EmployeeWithUser = Prisma.EmployeeGetPayload<{
  include: {
    user: {
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } };
        };
        branch: true;
      };
    };
  };
}>;

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    businessId: string,
    dto: CreateEmployeeDto,
    actor?: AuthenticatedUser,
  ) {
    await this.validateUniqueEmployee(businessId, dto);
    await this.assertRoleBelongsToBusiness(businessId, dto.roleId);
    await this.assertBranchBelongsToBusiness(businessId, dto.branchId);

    const password = await hashPassword(
      dto.password,
      this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12),
    );

    const employee = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          businessId,
          branchId: dto.branchId ?? null,
          roleId: dto.roleId ?? null,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          username: dto.username.trim(),
          password,
          profileImage: dto.profileImage?.trim() || null,
          status: this.toUserStatus(
            dto.status ?? EmployeeStatus.ACTIVE,
            dto.canLogin ?? true,
          ),
        },
      });

      const created = await tx.employee.create({
        data: {
          businessId,
          userId: user.id,
          employeeCode: dto.employeeCode.trim(),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          gender: dto.gender?.trim() || null,
          dateOfBirth: dto.dateOfBirth ?? null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          address: dto.address?.trim() || null,
          city: dto.city?.trim() || null,
          state: dto.state?.trim() || null,
          country: dto.country?.trim() || null,
          emergencyContactName: dto.emergencyContactName?.trim() || null,
          emergencyContactPhone: dto.emergencyContactPhone?.trim() || null,
          department: dto.department?.trim() || null,
          designation: dto.designation?.trim() || null,
          hireDate: dto.hireDate ?? null,
          salary: dto.salary ?? null,
          profileImage: dto.profileImage?.trim() || null,
          status: dto.status ?? EmployeeStatus.ACTIVE,
          canLogin: dto.canLogin ?? true,
          canSell: dto.canSell ?? true,
          canManageStock: dto.canManageStock ?? false,
          canManageExpenses: dto.canManageExpenses ?? false,
          canPrintReceipt: dto.canPrintReceipt ?? true,
          notes: dto.notes?.trim() || null,
          isSynced: true,
          syncVersion: 1,
          deviceId: dto.deviceId ?? null,
        },
        include: this.employeeInclude(),
      });

      await this.createAuditLog(tx, {
        businessId,
        userId: actor?.id,
        action: AuditAction.USER_CREATED,
        entity: 'Employee',
        entityId: created.id,
        description: `Created employee ${created.firstName} ${created.lastName}`,
        deviceId: dto.deviceId,
      });

      if (dto.roleId) {
        await this.createAuditLog(tx, {
          businessId,
          userId: actor?.id,
          action: AuditAction.ROLE_CHANGE,
          entity: 'EmployeeRole',
          entityId: created.id,
          description: `Assigned role ${dto.roleId} to employee ${created.employeeCode}`,
          deviceId: dto.deviceId,
        });
      }

      return created;
    });

    return this.sanitize(employee);
  }

  async findAll(businessId: string, query: EmployeeQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildWhere(businessId, query);

    const [total, items] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: this.employeeInclude(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: items.map((employee) => this.sanitize(employee)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async search(businessId: string, term: string, query: EmployeeQueryDto = {}) {
    return this.findAll(businessId, { ...query, search: term || query.search });
  }

  async findOne(businessId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: this.employeeInclude(),
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.sanitize(employee);
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateEmployeeDto,
    actor?: AuthenticatedUser,
  ) {
    const current = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { user: true },
    });

    if (!current) {
      throw new NotFoundException('Employee not found');
    }

    await this.validateUniqueEmployee(businessId, dto, id, current.userId);
    await this.assertRoleBelongsToBusiness(businessId, dto.roleId);
    await this.assertBranchBelongsToBusiness(businessId, dto.branchId);

    const password = dto.password
      ? await hashPassword(
          dto.password,
          this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12),
        )
      : undefined;
    const roleChanged =
      dto.roleId !== undefined && dto.roleId !== current.user.roleId;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.userId },
        data: {
          branchId: dto.branchId !== undefined ? dto.branchId : undefined,
          roleId: dto.roleId !== undefined ? dto.roleId : undefined,
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          email:
            dto.email !== undefined
              ? dto.email.trim().toLowerCase() || null
              : undefined,
          phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
          username: dto.username?.trim(),
          password,
          profileImage:
            dto.profileImage !== undefined
              ? dto.profileImage.trim() || null
              : undefined,
          status:
            dto.status !== undefined || dto.canLogin !== undefined
              ? this.toUserStatus(
                  dto.status ?? current.status,
                  dto.canLogin ?? current.canLogin,
                )
              : undefined,
        },
      });

      const employee = await tx.employee.update({
        where: { id },
        data: {
          employeeCode: dto.employeeCode?.trim(),
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          gender:
            dto.gender !== undefined ? dto.gender.trim() || null : undefined,
          dateOfBirth:
            dto.dateOfBirth !== undefined ? dto.dateOfBirth : undefined,
          phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
          email:
            dto.email !== undefined
              ? dto.email.trim().toLowerCase() || null
              : undefined,
          address:
            dto.address !== undefined ? dto.address.trim() || null : undefined,
          city: dto.city !== undefined ? dto.city.trim() || null : undefined,
          state: dto.state !== undefined ? dto.state.trim() || null : undefined,
          country:
            dto.country !== undefined ? dto.country.trim() || null : undefined,
          emergencyContactName:
            dto.emergencyContactName !== undefined
              ? dto.emergencyContactName.trim() || null
              : undefined,
          emergencyContactPhone:
            dto.emergencyContactPhone !== undefined
              ? dto.emergencyContactPhone.trim() || null
              : undefined,
          department:
            dto.department !== undefined
              ? dto.department.trim() || null
              : undefined,
          designation:
            dto.designation !== undefined
              ? dto.designation.trim() || null
              : undefined,
          hireDate: dto.hireDate !== undefined ? dto.hireDate : undefined,
          salary: dto.salary !== undefined ? dto.salary : undefined,
          profileImage:
            dto.profileImage !== undefined
              ? dto.profileImage.trim() || null
              : undefined,
          status: dto.status,
          canLogin: dto.canLogin,
          canSell: dto.canSell,
          canManageStock: dto.canManageStock,
          canManageExpenses: dto.canManageExpenses,
          canPrintReceipt: dto.canPrintReceipt,
          notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
        include: this.employeeInclude(),
      });

      if (dto.status && dto.status !== EmployeeStatus.ACTIVE) {
        await this.revokeSessions(tx, current.userId);
      }

      await this.createAuditLog(tx, {
        businessId,
        userId: actor?.id,
        action: AuditAction.USER_UPDATED,
        entity: 'Employee',
        entityId: id,
        description: `Updated employee ${employee.employeeCode}`,
        deviceId: dto.deviceId,
      });

      if (roleChanged) {
        await this.createAuditLog(tx, {
          businessId,
          userId: actor?.id,
          action: AuditAction.ROLE_CHANGE,
          entity: 'EmployeeRole',
          entityId: id,
          description: `Changed employee ${employee.employeeCode} role from ${current.user.roleId ?? 'none'} to ${dto.roleId ?? 'none'}`,
          deviceId: dto.deviceId,
        });
      }

      return employee;
    });

    return this.sanitize(updated);
  }

  async activate(
    businessId: string,
    id: string,
    dto: EmployeeStatusDto = {},
    actor?: AuthenticatedUser,
  ) {
    return this.setStatus(businessId, id, EmployeeStatus.ACTIVE, dto, actor);
  }

  async deactivate(
    businessId: string,
    id: string,
    dto: EmployeeStatusDto = {},
    actor?: AuthenticatedUser,
  ) {
    return this.setStatus(businessId, id, EmployeeStatus.INACTIVE, dto, actor);
  }

  async suspend(
    businessId: string,
    id: string,
    dto: EmployeeStatusDto = {},
    actor?: AuthenticatedUser,
  ) {
    return this.setStatus(businessId, id, EmployeeStatus.SUSPENDED, dto, actor);
  }

  async terminate(
    businessId: string,
    id: string,
    dto: EmployeeStatusDto = {},
    actor?: AuthenticatedUser,
  ) {
    return this.setStatus(
      businessId,
      id,
      EmployeeStatus.TERMINATED,
      dto,
      actor,
    );
  }

  async remove(businessId: string, id: string, actor: AuthenticatedUser) {
    const current = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { user: { include: { role: true } } },
    });

    if (!current) {
      throw new NotFoundException('Employee not found');
    }

    this.assertOwnerCanManageEmployee(current, actor, 'delete');

    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.userId },
        data: { status: UserStatus.INACTIVE },
      });

      await this.revokeSessions(tx, current.userId);

      await tx.employee.update({
        where: { id },
        data: {
          status: EmployeeStatus.TERMINATED,
          canLogin: false,
          deletedAt,
          isSynced: true,
          syncVersion: { increment: 1 },
        },
      });

      await this.createAuditLog(tx, {
        businessId,
        userId: actor.id,
        action: AuditAction.USER_DELETED,
        entity: 'Employee',
        entityId: id,
        description: `Deleted employee ${current.employeeCode}`,
      });
    });

    return { id, deleted: true };
  }

  async assignRole(
    businessId: string,
    id: string,
    dto: AssignEmployeeRoleDto,
    actor: AuthenticatedUser,
  ) {
    if (!dto.roleId && !dto.roleName) {
      throw new BadRequestException('roleId or roleName is required');
    }

    const current = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { user: { include: { role: true } } },
    });

    if (!current) {
      throw new NotFoundException('Employee not found');
    }

    const role = await this.resolveAssignableRole(businessId, dto, actor);

    if (current.user.roleId === role.id) {
      return this.findOne(businessId, id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.userId },
        data: { roleId: role.id },
      });

      const employee = await tx.employee.update({
        where: { id },
        data: {
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
        include: this.employeeInclude(),
      });

      await this.createAuditLog(tx, {
        businessId,
        userId: actor.id,
        action: AuditAction.ROLE_CHANGE,
        entity: 'EmployeeRole',
        entityId: id,
        description: `Changed employee ${employee.employeeCode} role from ${current.user.role?.name ?? 'none'} to ${role.name}${dto.reason ? `: ${dto.reason}` : ''}`,
        deviceId: dto.deviceId,
      });

      return employee;
    });

    return this.sanitize(updated);
  }

  async setLoginAccess(
    businessId: string,
    id: string,
    dto: EmployeeLoginAccessDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { user: { include: { role: true } } },
    });

    if (!current) {
      throw new NotFoundException('Employee not found');
    }

    this.assertOwnerCanManageEmployee(current, actor, 'update login access for');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.userId },
        data: { status: this.toUserStatus(current.status, dto.canLogin) },
      });

      if (!dto.canLogin) {
        await this.revokeSessions(tx, current.userId);
      }

      const employee = await tx.employee.update({
        where: { id },
        data: {
          canLogin: dto.canLogin,
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
        include: this.employeeInclude(),
      });

      await this.createAuditLog(tx, {
        businessId,
        userId: actor.id,
        action: AuditAction.USER_UPDATED,
        entity: 'EmployeeLoginAccess',
        entityId: id,
        description: `${dto.canLogin ? 'Enabled' : 'Disabled'} login for employee ${employee.employeeCode}${dto.reason ? `: ${dto.reason}` : ''}`,
        deviceId: dto.deviceId,
      });

      return employee;
    });

    return this.sanitize(updated);
  }

  async verifyPermissions(
    businessId: string,
    id: string,
    dto: PermissionVerificationDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        user: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const grantedPermissions = new Set(
      employee.user.role?.rolePermissions.map(
        (rolePermission) => rolePermission.permission.name,
      ) ?? [],
    );
    const requested = [
      ...new Set(
        dto.permissions.map((permission) => permission.trim()).filter(Boolean),
      ),
    ];
    const permissions = requested.map((permission) => ({
      permission,
      granted: grantedPermissions.has(permission),
      restricted: this.isPermissionRestrictedForRole(
        employee.user.role?.name ?? null,
        permission,
      ),
    }));

    return {
      employeeId: employee.id,
      userId: employee.userId,
      role: employee.user.role?.name ?? null,
      canLogin:
        employee.canLogin &&
        employee.status === EmployeeStatus.ACTIVE &&
        employee.user.status === UserStatus.ACTIVE,
      allowed: permissions.every(
        (permission) => permission.granted && !permission.restricted,
      ),
      permissions,
    };
  }

  async getProfile(businessId: string, id: string) {
    const employee = await this.findOne(businessId, id);
    const userId = employee.userId;
    const [salesCount, paymentsCount, expensesCount, sessions, profileActivity] =
      await Promise.all([
        this.prisma.sale.count({
          where: { businessId, userId, deletedAt: null },
        }),
        this.prisma.payment.count({ where: { businessId, userId } }),
        this.prisma.expense.count({ where: { businessId, userId } }),
        this.prisma.userSession.findMany({
          where: { userId },
          select: {
            id: true,
            deviceName: true,
            deviceId: true,
            deviceType: true,
            ipAddress: true,
            status: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.getEmployeeProfileActivity(businessId, employee),
      ]);

    return {
      employee,
      summary: {
        salesCount,
        paymentsCount,
        expensesCount,
        activeSessions: sessions.filter(
          (session) => session.status === SessionStatus.ACTIVE,
        ).length,
      },
      profileActivity,
      recentSessions: sessions,
    };
  }

  async getSales(
    businessId: string,
    id: string,
    query: EmployeeActivityQueryDto = {},
  ) {
    const employee = await this.getEmployeeContext(businessId, id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy === 'totalAmount' ? 'totalAmount' : 'saleDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildEmployeeSalesWhere(businessId, employee.userId, query);
    const completedWhere = {
      ...where,
      status: SaleStatus.COMPLETED,
    } satisfies Prisma.SaleWhereInput;

    const [total, completedSalesCount, aggregate, items] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.count({ where: completedWhere }),
      this.prisma.sale.aggregate({
        where: completedWhere,
        _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
        _avg: { totalAmount: true },
      }),
      this.prisma.sale.findMany({
        where,
        include: this.employeeSaleInclude(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      employee: this.basicEmployee(employee),
      summary: {
        transactions: total,
        completedSalesCount,
        totalSalesValue: aggregate._sum.totalAmount ?? new Prisma.Decimal(0),
        totalCollected: aggregate._sum.amountPaid ?? new Prisma.Decimal(0),
        totalBalanceDue: aggregate._sum.balanceDue ?? new Prisma.Decimal(0),
        averageSaleValue: aggregate._avg.totalAmount ?? new Prisma.Decimal(0),
      },
      data: items.map((sale) => this.formatEmployeeSale(sale)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async getEmployeeProfileActivity(
    businessId: string,
    employee: Awaited<ReturnType<EmployeeService['findOne']>>,
  ) {
    const userId = employee.userId;
    const employeeName =
      `${employee.firstName} ${employee.lastName}`.trim() ||
      employee.user.username;
    const matchTokens = [
      employee.employeeCode,
      employeeName,
      employee.user.username,
    ].filter(Boolean);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const disbursementEmployeeMatches: Prisma.GoodsDisbursementWhereInput[] = [
      { employeeId: employee.id },
      ...matchTokens.flatMap((token) => [
        {
          destination: {
            contains: token,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          remarks: {
            contains: token,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ]),
    ];

    const [soldItems, disbursements, salesTodayCount, salesTodayValue] =
      await Promise.all([
        this.prisma.saleItem.findMany({
          where: {
            sale: {
              businessId,
              userId,
              deletedAt: null,
              status: SaleStatus.COMPLETED,
            },
          },
          include: {
            sale: { select: { saleDate: true } },
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                sellingPrice: true,
                inventory: {
                  select: {
                    quantityOnHand: true,
                    quantityAvailable: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        this.prisma.goodsDisbursement.findMany({
          where: {
            businessId,
            OR: disbursementEmployeeMatches,
          },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    barcode: true,
                    sellingPrice: true,
                  },
                },
              },
            },
          },
          orderBy: { disbursementDate: 'desc' },
          take: 100,
        }),
        this.prisma.sale.count({
          where: {
            businessId,
            userId,
            deletedAt: null,
            status: SaleStatus.COMPLETED,
            saleDate: { gte: startOfToday, lt: endOfToday },
          },
        }),
        this.prisma.sale.aggregate({
          where: {
            businessId,
            userId,
            deletedAt: null,
            status: SaleStatus.COMPLETED,
            saleDate: { gte: startOfToday, lt: endOfToday },
          },
          _sum: { totalAmount: true },
        }),
      ]);

    const suppliedByProduct = new Map<string, number>();
    const supplyRecords = disbursements.map((run) => {
      let totalQuantity = 0;
      let totalValue = new Prisma.Decimal(0);

      for (const item of run.items) {
        totalQuantity += item.quantity;
        totalValue = totalValue.add(
          new Prisma.Decimal(item.product.sellingPrice).mul(item.quantity),
        );
        suppliedByProduct.set(
          item.productId,
          (suppliedByProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }

      return {
        id: run.id,
        employeeId: run.employeeId,
        disbursementNumber: run.disbursementNumber,
        disbursementDate: run.disbursementDate,
        destination: run.destination,
        remarks: run.remarks,
        totalQuantity,
        totalValue,
        items: run.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          sku: item.product.sku,
          barcode: item.product.barcode,
          quantity: item.quantity,
          value: new Prisma.Decimal(item.product.sellingPrice).mul(
            item.quantity,
          ),
        })),
      };
    });

    const stockByProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        sku: string | null;
        barcode: string | null;
        quantityInHand: number;
        quantitySold: number;
        suppliedQuantity: number;
        unitValue: Prisma.Decimal;
        totalSoldValue: Prisma.Decimal;
        lastActivityAt: Date;
      }
    >();

    for (const item of soldItems) {
      const existing = stockByProduct.get(item.productId);
      const unitValue = new Prisma.Decimal(item.product.sellingPrice);
      const totalSoldValue = new Prisma.Decimal(item.totalAmount);
      const lastActivityAt =
        !existing || item.sale.saleDate > existing.lastActivityAt
          ? item.sale.saleDate
          : existing.lastActivityAt;

      stockByProduct.set(item.productId, {
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        quantityInHand: existing?.quantityInHand ?? 0,
        quantitySold: (existing?.quantitySold ?? 0) + item.quantity,
        suppliedQuantity: suppliedByProduct.get(item.productId) ?? 0,
        unitValue,
        totalSoldValue: (existing?.totalSoldValue ?? new Prisma.Decimal(0)).add(
          totalSoldValue,
        ),
        lastActivityAt,
      });
    }

    for (const [productId, quantity] of suppliedByProduct) {
      if (stockByProduct.has(productId)) {
        continue;
      }

      const suppliedItem = disbursements
        .flatMap((run) => run.items)
        .find((item) => item.productId === productId);
      if (!suppliedItem) continue;

      stockByProduct.set(productId, {
        productId,
        productName: suppliedItem.product.name,
        sku: suppliedItem.product.sku,
        barcode: suppliedItem.product.barcode,
        quantityInHand: Math.max(0, quantity),
        quantitySold: 0,
        suppliedQuantity: quantity,
        unitValue: new Prisma.Decimal(suppliedItem.product.sellingPrice),
        totalSoldValue: new Prisma.Decimal(0),
        lastActivityAt: suppliedItem.createdAt,
      });
    }

    const stockItems = Array.from(stockByProduct.values())
      .map((item) => ({
        ...item,
        quantityInHand: Math.max(0, item.suppliedQuantity - item.quantitySold),
      }))
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    const stockValue = stockItems.reduce(
      (total, item) =>
        total.add(item.unitValue.mul(Math.max(0, item.quantityInHand))),
      new Prisma.Decimal(0),
    );
    const totalSuppliedQuantity = supplyRecords.reduce(
      (sum, run) => sum + run.totalQuantity,
      0,
    );
    const totalSuppliedValue = supplyRecords.reduce(
      (sum, run) => sum.add(run.totalValue),
      new Prisma.Decimal(0),
    );

    return {
      stats: {
        stockItems: stockItems.length,
        stockValue,
        totalSupplied: totalSuppliedQuantity,
        salesToday: salesTodayCount,
        salesTodayValue:
          salesTodayValue._sum.totalAmount ?? new Prisma.Decimal(0),
      },
      stock: stockItems.slice(0, 50),
      supplies: {
        summary: {
          totalSupplyRuns: supplyRecords.length,
          totalSuppliedQuantity,
          totalSuppliedValue,
        },
        data: supplyRecords,
      },
    };
  }

  async printSalesRecord(
    businessId: string,
    id: string,
    query: EmployeeActivityQueryDto = {},
  ) {
    const employee = await this.getEmployeeContext(businessId, id);
    const where = this.buildEmployeeSalesWhere(businessId, employee.userId, {
      ...query,
      status: SaleStatus.COMPLETED,
      limit: 200,
    });

    const [business, aggregate, sales] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          name: true,
          address: true,
          phone: true,
          currency: true,
        },
      }),
      this.prisma.sale.aggregate({
        where,
        _count: { id: true },
        _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
      }),
      this.prisma.sale.findMany({
        where,
        include: this.employeeSaleInclude(),
        orderBy: { saleDate: query.sortOrder ?? 'desc' },
        take: 200,
      }),
    ]);

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const formattedSales = sales.map((sale) => this.formatEmployeeSale(sale));
    const employeeName =
      `${employee.firstName} ${employee.lastName}`.trim() ||
      employee.user.username;
    const period =
      query.startDate || query.endDate
        ? `${query.startDate ? query.startDate.toISOString().slice(0, 10) : 'Beginning'} to ${query.endDate ? query.endDate.toISOString().slice(0, 10) : 'Now'}`
        : 'All dates';
    const total = aggregate._sum.totalAmount ?? new Prisma.Decimal(0);
    const lines = [
      business.name,
      business.address ?? null,
      business.phone ? `Phone: ${business.phone}` : null,
      '',
      'Employee Sales Record',
      `Employee: ${employeeName}`,
      `Employee Code: ${employee.employeeCode}`,
      `Period: ${period}`,
      `Sales Count: ${aggregate._count.id}`,
      `Total Sales: ${this.money(total, business.currency)}`,
      `Total Collected: ${this.money(aggregate._sum.amountPaid ?? 0, business.currency)}`,
      `Total Balance: ${this.money(aggregate._sum.balanceDue ?? 0, business.currency)}`,
      '',
      'Sales',
      ...formattedSales.map((sale) => {
        const primaryPayment = sale.payments[0]?.paymentMethod ?? 'UNPAID';
        const customer =
          sale.customer?.companyName ||
          [sale.customer?.firstName, sale.customer?.lastName]
            .filter(Boolean)
            .join(' ') ||
          'Walk-in Customer';

        return [
          sale.saleNumber,
          new Date(sale.saleDate).toISOString().slice(0, 10),
          customer,
          primaryPayment,
          this.money(sale.totalAmount, business.currency),
        ].join(' | ');
      }),
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    return {
      format: 'employee-sales-record-v1',
      text: lines,
      data: {
        business,
        employee: this.basicEmployee(employee),
        period,
        summary: {
          salesCount: aggregate._count.id,
          totalSalesValue: total,
          totalCollected: aggregate._sum.amountPaid ?? new Prisma.Decimal(0),
          totalBalanceDue: aggregate._sum.balanceDue ?? new Prisma.Decimal(0),
        },
        sales: formattedSales,
      },
    };
  }

  async getActivity(
    businessId: string,
    id: string,
    query: EmployeeActivityQueryDto = {},
  ) {
    const employee = await this.getEmployeeContext(businessId, id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [sessions, auditLogs, sales] = await Promise.all([
      this.prisma.userSession.findMany({
        where: {
          userId: employee.userId,
          ...(query.startDate || query.endDate
            ? { createdAt: this.dateRange(query) }
            : {}),
        },
        select: {
          id: true,
          status: true,
          deviceName: true,
          deviceId: true,
          deviceType: true,
          ipAddress: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.auditLog.findMany({
        where: {
          businessId,
          userId: employee.userId,
          ...(query.startDate || query.endDate
            ? { createdAt: this.dateRange(query) }
            : {}),
          ...(query.entity ? { entity: query.entity.trim() } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.sale.findMany({
        where: {
          businessId,
          userId: employee.userId,
          deletedAt: null,
          ...(query.startDate || query.endDate
            ? { saleDate: this.dateRange(query) }
            : {}),
        },
        select: {
          id: true,
          saleNumber: true,
          totalAmount: true,
          paymentStatus: true,
          status: true,
          saleDate: true,
        },
        orderBy: { saleDate: 'desc' },
        take: 100,
      }),
    ]);

    const entries = [
      ...sessions.map((session) => ({
        type: 'LOGIN_SESSION' as const,
        date: session.createdAt,
        record: session,
      })),
      ...auditLogs.map((log) => ({
        type: 'AUDIT_LOG' as const,
        date: log.createdAt,
        record: log,
      })),
      ...sales.map((sale) => ({
        type: 'SALE' as const,
        date: sale.saleDate,
        record: sale,
      })),
    ]
      .sort((a, b) =>
        query.sortOrder === 'asc'
          ? a.date.getTime() - b.date.getTime()
          : b.date.getTime() - a.date.getTime(),
      )
      .filter(
        (entry) =>
          !query.search ||
          JSON.stringify(entry.record)
            .toLowerCase()
            .includes(query.search.trim().toLowerCase()),
      );

    const total = entries.length;
    return {
      employee: this.basicEmployee(employee),
      lastLogin: employee.lastLogin ?? employee.user.lastLogin,
      status: employee.status,
      data: entries.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPerformance(
    businessId: string,
    id: string,
    query: EmployeeActivityQueryDto = {},
  ) {
    const employee = await this.getEmployeeContext(businessId, id);
    const saleWhere: Prisma.SaleWhereInput = {
      businessId,
      userId: employee.userId,
      deletedAt: null,
      ...(query.startDate || query.endDate
        ? { saleDate: this.dateRange(query) }
        : {}),
    };

    const [aggregate, totalTransactions, loginCount, auditCount, sales] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: saleWhere,
          _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
        }),
        this.prisma.sale.count({ where: saleWhere }),
        this.prisma.auditLog.count({
          where: {
            businessId,
            userId: employee.userId,
            action: { in: [AuditAction.LOGIN, AuditAction.LOGIN_SUCCESS] },
            ...(query.startDate || query.endDate
              ? { createdAt: this.dateRange(query) }
              : {}),
          },
        }),
        this.prisma.auditLog.count({
          where: {
            businessId,
            userId: employee.userId,
            ...(query.startDate || query.endDate
              ? { createdAt: this.dateRange(query) }
              : {}),
          },
        }),
        this.prisma.sale.findMany({
          where: saleWhere,
          select: { saleDate: true, totalAmount: true },
          orderBy: { saleDate: 'asc' },
        }),
      ]);

    return {
      employee: this.basicEmployee(employee),
      status: employee.status,
      lastLogin: employee.lastLogin ?? employee.user.lastLogin,
      totals: {
        transactions: totalTransactions,
        salesValue: aggregate._sum.totalAmount ?? 0,
        collectedValue: aggregate._sum.amountPaid ?? 0,
        balanceDue: aggregate._sum.balanceDue ?? 0,
        loginCount,
        auditEvents: auditCount,
      },
      dailySales: this.bucketSales(sales, 'day'),
      weeklySales: this.bucketSales(sales, 'week'),
      monthlySales: this.bucketSales(sales, 'month'),
    };
  }

  async getAuditLog(
    businessId: string,
    id: string,
    query: EmployeeActivityQueryDto = {},
  ) {
    const employee = await this.getEmployeeContext(businessId, id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.AuditLogWhereInput = {
      businessId,
      userId: employee.userId,
      ...(query.startDate || query.endDate
        ? { createdAt: this.dateRange(query) }
        : {}),
      ...(query.entity ? { entity: query.entity.trim() } : {}),
      ...(query.search
        ? {
            OR: [
              {
                entity: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                description: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      employee: this.basicEmployee(employee),
      data: logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async setStatus(
    businessId: string,
    id: string,
    status: EmployeeStatus,
    dto: EmployeeStatusDto,
    actor?: AuthenticatedUser,
  ) {
    const current = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { user: { include: { role: true } } },
    });
    if (!current) {
      throw new NotFoundException('Employee not found');
    }

    if (actor && (current.id === actor.employeeId || current.userId === actor.id)) {
      throw new ForbiddenException('You cannot update your own employee status');
    }

    if (current.user.role?.name === SYSTEM_ROLES.OWNER) {
      throw new ForbiddenException('Owner employee profile status cannot be changed');
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.userId },
        data: { status: this.toUserStatus(status, current.canLogin) },
      });

      if (status !== EmployeeStatus.ACTIVE) {
        await this.revokeSessions(tx, current.userId);
      }

      const updated = await tx.employee.update({
        where: { id },
        data: {
          status,
          isSynced: true,
          syncVersion: { increment: 1 },
          deviceId: dto.deviceId ?? undefined,
        },
        include: this.employeeInclude(),
      });

      await this.createAuditLog(tx, {
        businessId,
        userId: actor?.id,
        action: AuditAction.USER_UPDATED,
        entity: 'EmployeeStatus',
        entityId: id,
        description: `Changed employee ${updated.employeeCode} status to ${status}${dto.reason ? `: ${dto.reason}` : ''}`,
        deviceId: dto.deviceId,
      });

      return updated;
    });

    return this.sanitize(employee);
  }

  private assertOwnerCanManageEmployee(
    employee: {
      id: string;
      userId: string;
      user: { role?: { name: string } | null };
    },
    actor: AuthenticatedUser,
    action: string,
  ): void {
    if (actor.roleName !== SYSTEM_ROLES.OWNER) {
      throw new ForbiddenException('Only a business owner can manage employees');
    }

    if (employee.id === actor.employeeId || employee.userId === actor.id) {
      throw new ForbiddenException(
        `You cannot ${action} your own employee profile`,
      );
    }

    if (employee.user.role?.name === SYSTEM_ROLES.OWNER) {
      throw new ForbiddenException('Owner employee profile cannot be managed');
    }
  }

  private async getEmployeeContext(businessId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { user: { include: { role: true, branch: true } } },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private dateRange(query: EmployeeActivityQueryDto): Prisma.DateTimeFilter {
    return {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }

  private buildEmployeeSalesWhere(
    businessId: string,
    userId: string,
    query: EmployeeActivityQueryDto,
  ): Prisma.SaleWhereInput {
    const search = query.search?.trim();
    const numericSearch = search && !Number.isNaN(Number(search)) ? search : null;
    const paymentSearch =
      search
        ?.trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_') ?? '';
    const paymentMethodSearch = (
      Object.values(PaymentMethod) as PaymentMethod[]
    ).find((method) => method === paymentSearch);

    return {
      businessId,
      userId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentMethod
        ? { payments: { some: { paymentMethod: query.paymentMethod } } }
        : {}),
      ...(query.startDate || query.endDate
        ? { saleDate: this.dateRange(query) }
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
                  companyName: {
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
              {
                payments: {
                  some: {
                    referenceNumber: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
              ...(paymentMethodSearch
                ? [
                    {
                      payments: {
                        some: { paymentMethod: paymentMethodSearch },
                      },
                    },
                  ]
                : []),
              ...(numericSearch
                ? [
                    {
                      totalAmount: new Prisma.Decimal(numericSearch),
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };
  }

  private employeeSaleInclude() {
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
      payments: { orderBy: { paymentDate: 'asc' } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: {
            select: { id: true, name: true, sku: true, barcode: true },
          },
        },
      },
      receipt: { select: { id: true, receiptNumber: true } },
    } satisfies Prisma.SaleInclude;
  }

  private formatEmployeeSale(
    sale: Prisma.SaleGetPayload<{
      include: ReturnType<EmployeeService['employeeSaleInclude']>;
    }>,
  ) {
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      customerId: sale.customerId,
      userId: sale.userId,
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      taxAmount: sale.taxAmount,
      totalAmount: sale.totalAmount,
      amountPaid: sale.amountPaid,
      balanceDue: sale.balanceDue,
      paymentStatus: sale.paymentStatus,
      status: sale.status,
      remarks: sale.remarks,
      saleDate: sale.saleDate,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      customer: sale.customer,
      user: sale.user,
      items: sale.items,
      payments: sale.payments,
      receipt: sale.receipt,
    };
  }

  private money(value: Prisma.Decimal | number | string, currency = 'USD') {
    const amount = Number(value);
    return `${currency} ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private basicEmployee(employee: {
    id: string;
    userId: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    status: EmployeeStatus;
    user: { role?: { name: string } | null; branch?: { name: string } | null };
  }) {
    return {
      id: employee.id,
      userId: employee.userId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      status: employee.status,
      role: employee.user.role?.name ?? null,
      branch: employee.user.branch?.name ?? null,
    };
  }

  private bucketSales(
    sales: Array<{ saleDate: Date; totalAmount: Prisma.Decimal }>,
    bucket: 'day' | 'week' | 'month',
  ) {
    const map = new Map<
      string,
      { transactions: number; totalSalesValue: Prisma.Decimal }
    >();

    for (const sale of sales) {
      const key = this.bucketKey(sale.saleDate, bucket);
      const current = map.get(key) ?? {
        transactions: 0,
        totalSalesValue: new Prisma.Decimal(0),
      };
      map.set(key, {
        transactions: current.transactions + 1,
        totalSalesValue: current.totalSalesValue.add(sale.totalAmount),
      });
    }

    return [...map.entries()].map(([period, value]) => ({ period, ...value }));
  }

  private bucketKey(date: Date, bucket: 'day' | 'week' | 'month') {
    const value = new Date(date);

    if (bucket === 'month') {
      return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    if (bucket === 'week') {
      const start = new Date(
        Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate(),
        ),
      );
      start.setUTCDate(start.getUTCDate() - start.getUTCDay());
      return start.toISOString().slice(0, 10);
    }

    return value.toISOString().slice(0, 10);
  }

  private buildWhere(
    businessId: string,
    query: EmployeeQueryDto,
  ): Prisma.EmployeeWhereInput {
    const search = query.search?.trim();

    return {
      businessId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.department
        ? {
            department: {
              equals: query.department.trim(),
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(query.designation
        ? {
            designation: {
              equals: query.designation.trim(),
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(query.canLogin !== undefined ? { canLogin: query.canLogin } : {}),
      ...(search
        ? {
            OR: [
              {
                employeeCode: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                firstName: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                lastName: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                phone: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
              {
                email: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
              {
                department: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                designation: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                user: {
                  username: {
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

  private async validateUniqueEmployee(
    businessId: string,
    dto: Partial<CreateEmployeeDto>,
    employeeId?: string,
    userId?: string,
  ) {
    const employeeChecks: Prisma.EmployeeWhereInput[] = [];
    const userChecks: Prisma.UserWhereInput[] = [];

    if (dto.employeeCode) {
      employeeChecks.push({ employeeCode: dto.employeeCode.trim() });
    }
    if (dto.email) {
      employeeChecks.push({ email: dto.email.trim().toLowerCase() });
      userChecks.push({ email: dto.email.trim().toLowerCase() });
    }
    if (dto.phone) {
      employeeChecks.push({ phone: dto.phone.trim() });
      userChecks.push({ phone: dto.phone.trim() });
    }
    if (dto.username) {
      userChecks.push({ username: dto.username.trim() });
    }

    if (employeeChecks.length > 0) {
      const existingEmployee = await this.prisma.employee.findFirst({
        where: {
          businessId,
          deletedAt: null,
          ...(employeeId ? { id: { not: employeeId } } : {}),
          OR: employeeChecks,
        },
      });
      if (existingEmployee) {
        throw new BadRequestException(
          'Employee code, email, or phone is already in use',
        );
      }
    }

    if (userChecks.length > 0) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          businessId,
          ...(userId ? { id: { not: userId } } : {}),
          OR: userChecks,
        },
      });
      if (existingUser) {
        throw new BadRequestException(
          'Username, email, or phone is already in use',
        );
      }
    }
  }

  private async assertRoleBelongsToBusiness(
    businessId: string,
    roleId?: string,
  ) {
    if (!roleId) {
      return;
    }
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, businessId },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException('Role does not belong to this business');
    }
  }

  private async resolveAssignableRole(
    businessId: string,
    dto: AssignEmployeeRoleDto,
    actor: AuthenticatedUser,
  ) {
    const role = await this.prisma.role.findFirst({
      where: {
        businessId,
        ...(dto.roleId ? { id: dto.roleId } : { name: dto.roleName }),
      },
      select: { id: true, name: true },
    });

    if (!role) {
      throw new BadRequestException('Role does not belong to this business');
    }

    if (
      role.name === SYSTEM_ROLES.OWNER &&
      actor.roleName !== SYSTEM_ROLES.OWNER
    ) {
      throw new BadRequestException('Only an Owner can assign the Owner role');
    }

    return role;
  }

  private isPermissionRestrictedForRole(
    roleName: string | null,
    permission: string,
  ) {
    if (roleName === SYSTEM_ROLES.SALESPERSON) {
      return [
        'admin.access',
        'businesses.manage',
        'users.manage',
        'employees.manage',
        'roles.manage',
        'settings.manage',
        'notifications.manage',
        'audit-logs.view',
        'reports.view',
        'products.manage',
        'inventory.manage',
        'suppliers.manage',
        'expenses.manage',
        'goods-supplied.manage',
        'goods-disbursement.manage',
        'credit-sales.manage',
      ].includes(permission);
    }

    return false;
  }

  private async assertBranchBelongsToBusiness(
    businessId: string,
    branchId?: string,
  ) {
    if (!branchId) {
      return;
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException('Branch does not belong to this business');
    }
  }

  private toUserStatus(status: EmployeeStatus, canLogin: boolean): UserStatus {
    if (status === EmployeeStatus.SUSPENDED) {
      return UserStatus.SUSPENDED;
    }
    if (status === EmployeeStatus.ACTIVE && canLogin) {
      return UserStatus.ACTIVE;
    }
    return UserStatus.INACTIVE;
  }

  private async revokeSessions(tx: Prisma.TransactionClient, userId: string) {
    await tx.userSession.updateMany({
      where: { userId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, refreshToken: '' },
    });
  }

  private async createAuditLog(
    tx: Prisma.TransactionClient,
    data: {
      businessId: string;
      userId?: string;
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
        userId: data.userId ?? null,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        description: data.description,
        deviceId: data.deviceId ?? null,
      },
    });
  }

  private employeeInclude() {
    return {
      user: {
        include: {
          role: {
            include: { rolePermissions: { include: { permission: true } } },
          },
          branch: true,
        },
      },
    } satisfies Prisma.EmployeeInclude;
  }

  private sanitize(employee: EmployeeWithUser) {
    const { password, ...safeUser } = employee.user;
    void password;
    return { ...employee, user: safeUser };
  }
}
