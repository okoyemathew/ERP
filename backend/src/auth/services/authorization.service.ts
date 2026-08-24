import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityUtil } from '../utils/security.util';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityUtil: SecurityUtil,
  ) {}

  async getRoleName(roleId: string | null): Promise<string | null> {
    if (!roleId) {
      return null;
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    return role?.name ?? null;
  }

  async userHasPermissions(
    roleId: string | null,
    businessId: string,
    requiredPermissions: readonly string[],
  ): Promise<boolean> {
    if (requiredPermissions.length === 0) {
      return true;
    }

    if (!roleId) {
      return false;
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId,
        role: { businessId },
        permission: {
          businessId,
          name: { in: [...requiredPermissions] },
        },
      },
      select: {
        permission: {
          select: { name: true },
        },
      },
    });

    return this.securityUtil.hasAllPermissions(
      rolePermissions.map((rolePermission) => rolePermission.permission.name),
      [...new Set(requiredPermissions)],
    );
  }
}
