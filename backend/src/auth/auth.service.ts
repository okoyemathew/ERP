import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import {
  AuditAction,
  BranchStatus,
  BusinessStatus,
  EmployeeStatus,
  PasswordResetChannel,
  Prisma,
  SessionStatus,
  UserStatus,
} from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import { JwtPayload } from './types/jwt-payload.type';
import { hashPassword, verifyPassword } from './utils/password.util';
import { PasswordResetDeliveryService } from './services/password-reset-delivery.service';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

type LoginUser = {
  id: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  businessId: string;
  branchId: string | null;
  roleId: string | null;
  status: string;
  role: {
    name: string;
    rolePermissions: {
      permission: {
        name: string;
      };
    }[];
  } | null;
  employee: {
    id: string;
    status: string;
    canLogin: boolean;
  } | null;
};

type LoginUserWithEmployee = Omit<LoginUser, 'employee'> & {
  employee: {
    id: string;
    status: string;
    canLogin: boolean;
  };
};

export type ValidatedLoginUser = Omit<LoginUserWithEmployee, 'password'>;

type AuthResponse = TokenPair & {
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    businessId: string;
    branchId: string | null;
    roleId: string | null;
    roleName: string | null;
    employeeId: string;
    permissions: string[];
  };
};

type CurrentUserProfile = {
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    profileImage: string | null;
    status: string;
    businessId: string;
    branchId: string | null;
    roleId: string | null;
    roleName: string | null;
    employeeId: string | null;
    lastLogin: Date | null;
  };
  business: {
    id: string;
    name: string;
    about: string | null;
    email: string | null;
    phone: string | null;
    logo: string | null;
    address: string | null;
    currency: string;
    timezone: string;
    status: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
    status: string;
  } | null;
  role: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  permissions: string[];
  session: {
    id: string | undefined;
  };
};

const DEFAULT_ROLES = [
  'Owner',
  'Admin',
  'Manager',
  'Cashier',
  'Salesperson',
  'Inventory Officer',
  'Accountant',
  'Supervisor',
] as const;

type DefaultRoleName = (typeof DEFAULT_ROLES)[number];

const DEFAULT_PERMISSIONS = [
  {
    name: 'dashboard.view',
    module: 'Dashboard',
    description: 'View dashboard and analytics',
  },
  {
    name: 'users.manage',
    module: 'Users',
    description: 'Create, update, and manage users',
  },
  {
    name: 'employees.manage',
    module: 'Employees',
    description: 'Create, update, and manage employees',
  },
  {
    name: 'roles.manage',
    module: 'Roles',
    description: 'Create, update, and manage roles',
  },
  {
    name: 'businesses.manage',
    module: 'Businesses',
    description: 'Manage business settings and profile',
  },
  {
    name: 'products.manage',
    module: 'Products',
    description: 'Create, update, and manage products',
  },
  {
    name: 'categories.manage',
    module: 'Categories',
    description: 'Create, update, and manage categories',
  },
  {
    name: 'brands.manage',
    module: 'Brands',
    description: 'Create, update, and manage brands',
  },
  {
    name: 'units.manage',
    module: 'Units',
    description: 'Create, update, and manage units',
  },
  {
    name: 'inventory.manage',
    module: 'Inventory',
    description: 'Manage inventory records and stock',
  },
  {
    name: 'suppliers.manage',
    module: 'Suppliers',
    description: 'Create, update, and manage suppliers',
  },
  {
    name: 'customers.manage',
    module: 'Customers',
    description: 'Create, update, and manage customers',
  },
  {
    name: 'sales.manage',
    module: 'Sales',
    description: 'Create and manage sales transactions',
  },
  {
    name: 'credit-sales.manage',
    module: 'Credit Sales',
    description: 'Manage credit sales transactions',
  },
  {
    name: 'expenses.manage',
    module: 'Expenses',
    description: 'Create and manage expenses',
  },
  {
    name: 'reports.view',
    module: 'Reports',
    description: 'View reports and summaries',
  },
  {
    name: 'notifications.manage',
    module: 'Notifications',
    description: 'Manage system notifications',
  },
  {
    name: 'settings.manage',
    module: 'Settings',
    description: 'Update system settings',
  },
  {
    name: 'receipt.manage',
    module: 'Receipt',
    description: 'Manage receipt preferences and printing',
  },
  {
    name: 'goods-supplied.manage',
    module: 'Goods Supplied',
    description: 'Create and manage supplied goods',
  },
  {
    name: 'goods-disbursement.manage',
    module: 'Goods Disbursement',
    description: 'Create and manage goods disbursements',
  },
  {
    name: 'audit-logs.view',
    module: 'Audit Logs',
    description: 'View audit logs and activity history',
  },
];

const ROLE_PERMISSIONS: Record<DefaultRoleName, string[]> = {
  Owner: DEFAULT_PERMISSIONS.map((permission) => permission.name),
  Admin: DEFAULT_PERMISSIONS.filter(
    (permission) => permission.name !== 'businesses.manage',
  ).map((permission) => permission.name),
  Manager: [
    'sales.manage',
    'inventory.manage',
    'customers.manage',
    'reports.view',
  ],
  Cashier: ['sales.manage', 'receipt.manage', 'customers.manage'],
  Salesperson: ['sales.manage', 'receipt.manage'],
  'Inventory Officer': [
    'inventory.manage',
    'goods-supplied.manage',
    'goods-disbursement.manage',
  ],
  Accountant: ['expenses.manage', 'reports.view', 'credit-sales.manage'],
  Supervisor: ['reports.view', 'inventory.manage', 'sales.manage'],
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordResetDeliveryService: PasswordResetDeliveryService,
  ) {}

  async login(loginDto: LoginDto, request: Request): Promise<AuthResponse> {
    const user = await this.validateUser(
      loginDto.emailOrPhone,
      loginDto.password,
    );

    return this.loginWithUser(user, request, {
      deviceName: loginDto.deviceName,
      deviceId: loginDto.deviceId,
      deviceType: loginDto.deviceType,
    });
  }

  async registerOwner(
    dto: RegisterOwnerDto,
    request: Request,
  ): Promise<{
    success: true;
    message: string;
    businessId: string;
    userId: string;
  }> {
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const ownerPhone = dto.ownerPhone?.trim() || undefined;
    const businessName = dto.businessName.trim();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: ownerEmail },
          ...(ownerPhone ? [{ phone: ownerPhone }] : []),
        ],
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(
        'An account already exists with this email or phone number',
      );
    }

    const existingBusiness = await this.prisma.business.findFirst({
      where: {
        OR: [
          { name: { equals: businessName, mode: 'insensitive' } },
          { email: ownerEmail },
        ],
      },
      select: { id: true },
    });

    if (existingBusiness) {
      throw new ConflictException(
        'A business already exists with this name or email address',
      );
    }

    const [firstName, lastName] = this.splitFullName(dto.ownerFullName);
    const branchCode = this.generateBranchCode(businessName);
    const username = await this.generateUsername(ownerEmail);
    const password = await this.hashToken(dto.password);
    const ipAddress = this.getIpAddress(request);
    const deviceId = request.headers['x-device-id'];

    const result = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: businessName,
          email: ownerEmail,
          phone: ownerPhone,
          address: dto.businessAddress?.trim() || undefined,
          status: BusinessStatus.ACTIVE,
          settings: {
            create: {
              currency: 'USD',
              timezone: 'UTC',
              language: 'en',
              allowCreditSales: true,
              enableOfflineMode: true,
            },
          },
          receiptSettings: {
            create: {
              businessName,
              businessAddress: dto.businessAddress?.trim() || undefined,
              businessPhone: ownerPhone,
              footerMessage: 'Thank you for shopping with us.',
            },
          },
          taxSettings: {
            create: {
              taxName: 'Tax',
              taxPercentage: 0,
              taxEnabled: false,
            },
          },
          notificationSettings: {
            create: {},
          },
        },
      });

      const branch = await tx.branch.create({
        data: {
          businessId: business.id,
          name: 'Main Branch',
          code: branchCode,
          phone: ownerPhone,
          email: ownerEmail,
          address: dto.businessAddress?.trim() || undefined,
          status: BranchStatus.ACTIVE,
        },
      });

      const roles = await Promise.all(
        DEFAULT_ROLES.map((roleName) =>
          tx.role.create({
            data: {
              businessId: business.id,
              name: roleName,
              description: `${roleName} role`,
            },
          }),
        ),
      );

      const permissions = await Promise.all(
        DEFAULT_PERMISSIONS.map((permission) =>
          tx.permission.create({
            data: {
              businessId: business.id,
              name: permission.name,
              module: permission.module,
              description: permission.description,
            },
          }),
        ),
      );

      const rolesByName = new Map(roles.map((role) => [role.name, role]));
      const permissionsByName = new Map(
        permissions.map((permission) => [permission.name, permission]),
      );

      await Promise.all(
        Object.entries(ROLE_PERMISSIONS).flatMap(
          ([roleName, permissionNames]) =>
            permissionNames.map((permissionName) => {
              const role = rolesByName.get(roleName);
              const permission = permissionsByName.get(permissionName);

              if (!role || !permission) {
                throw new Error(
                  `Unable to assign ${permissionName} to ${roleName}`,
                );
              }

              return tx.rolePermission.create({
                data: {
                  roleId: role.id,
                  permissionId: permission.id,
                },
              });
            }),
        ),
      );

      const ownerRole = rolesByName.get('Owner');

      if (!ownerRole) {
        throw new Error('Owner role was not created');
      }

      const user = await tx.user.create({
        data: {
          businessId: business.id,
          branchId: branch.id,
          roleId: ownerRole.id,
          firstName,
          lastName,
          email: ownerEmail,
          phone: ownerPhone,
          username,
          password,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.employee.create({
        data: {
          businessId: business.id,
          userId: user.id,
          employeeCode: 'OWNER-0001',
          firstName,
          lastName,
          phone: ownerPhone,
          email: ownerEmail,
          address: dto.businessAddress?.trim() || undefined,
          department: 'Management',
          designation: 'Business Owner',
          hireDate: new Date(),
          status: EmployeeStatus.ACTIVE,
          canLogin: true,
          canSell: true,
          canManageStock: true,
          canManageExpenses: true,
          canPrintReceipt: true,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.CREATE,
        businessId: business.id,
        userId: user.id,
        entity: 'Business',
        entityId: business.id,
        description: `Business owner account created for ${businessName}`,
        ipAddress,
        deviceId: Array.isArray(deviceId) ? deviceId[0] : deviceId,
      });

      return { businessId: business.id, userId: user.id };
    });

    return {
      success: true,
      message: 'Business owner account created. Please sign in.',
      ...result,
    };
  }

  async loginWithUser(
    user: ValidatedLoginUser,
    request: Request,
    deviceMetadata?: {
      deviceName?: string;
      deviceId?: string;
      deviceType?: string;
    },
  ): Promise<AuthResponse> {
    const loggedInAt = new Date();
    const ipAddress = this.getIpAddress(request);
    const userAgent = request.get('user-agent');

    const { tokens } = await this.prisma.$transaction(async (tx) => {
      const session = await tx.userSession.create({
        data: {
          userId: user.id,
          refreshToken: '',
          ipAddress,
          userAgent,
          deviceName: deviceMetadata?.deviceName,
          deviceId: deviceMetadata?.deviceId,
          deviceType: deviceMetadata?.deviceType,
          expiresAt: this.getRefreshTokenExpiryDate(),
          status: SessionStatus.ACTIVE,
        },
      });

      const tokenPair = await this.createTokenPair({
        sub: user.id,
        username: user.username,
        businessId: user.businessId,
        branchId: user.branchId,
        roleId: user.roleId,
        sessionId: session.id,
      });

      await tx.userSession.update({
        where: { id: session.id },
        data: { refreshToken: await this.hashToken(tokenPair.refreshToken) },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { lastLogin: loggedInAt },
      });

      const employee = user.employee;
      await tx.employee.update({
        where: { id: employee.id },
        data: { lastLogin: loggedInAt },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.LOGIN_SUCCESS,
        businessId: user.businessId,
        userId: user.id,
        entity: 'UserSession',
        entityId: session.id,
        description: `User logged in at ${loggedInAt.toISOString()}`,
        ipAddress,
        deviceId: deviceMetadata?.deviceId,
      });

      return { tokens: tokenPair };
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        businessId: user.businessId,
        branchId: user.branchId,
        roleId: user.roleId,
        roleName: user.role?.name ?? null,
        employeeId: user.employee.id,
        permissions:
          user.role?.rolePermissions.map(
            (rolePermission) => rolePermission.permission.name,
          ) ?? [],
      },
    };
  }

  async validateUser(
    emailOrPhone: string,
    password: string,
    request?: Request,
  ): Promise<ValidatedLoginUser> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: emailOrPhone },
          { phone: emailOrPhone },
          { username: emailOrPhone },
        ],
      },
      select: {
        id: true,
        username: true,
        password: true,
        firstName: true,
        lastName: true,
        businessId: true,
        branchId: true,
        roleId: true,
        status: true,
        role: {
          select: {
            name: true,
            rolePermissions: {
              select: {
                permission: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        employee: {
          select: {
            id: true,
            status: true,
            canLogin: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email, phone, or password');
    }

    const passwordMatches = await verifyPassword(password, user.password);
    if (!passwordMatches) {
      await this.auditFailedLogin(user.id, user.businessId, request);
      throw new UnauthorizedException('Invalid email, phone, or password');
    }

    if (!user.employee) {
      await this.auditFailedLogin(user.id, user.businessId, request);
      throw new UnauthorizedException('Invalid email, phone, or password');
    }

    try {
      this.assertUserCanLogin(user);
    } catch (error) {
      await this.auditFailedLogin(user.id, user.businessId, request);
      throw error;
    }

    const validatedUser: Partial<LoginUser> = { ...user };
    delete validatedUser.password;
    return validatedUser as ValidatedLoginUser;
  }

  async refreshToken(
    refreshTokenDto: RefreshTokenDto,
    request: Request,
  ): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshTokenDto.refreshToken);
    const ipAddress = this.getIpAddress(request);

    if (!payload.sessionId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: { user: { include: { employee: true } } },
    });

    if (
      !session ||
      session.status !== SessionStatus.ACTIVE ||
      session.expiresAt <= new Date() ||
      session.refreshToken.length === 0
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    this.assertUserCanLogin(session.user);

    const refreshTokenMatches = await verifyPassword(
      refreshTokenDto.refreshToken,
      session.refreshToken,
    );

    if (!refreshTokenMatches) {
      await this.prisma.$transaction(async (tx) => {
        await tx.userSession.update({
          where: { id: session.id },
          data: {
            refreshToken: '',
            status: SessionStatus.REVOKED,
          },
        });

        await this.createAuditLog(tx, {
          action: AuditAction.SESSION_REVOKED,
          businessId: session.user.businessId,
          userId: session.user.id,
          entity: 'UserSession',
          entityId: session.id,
          description:
            'Session revoked because a rotated refresh token was reused',
          ipAddress,
        });
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.createTokenPair({
      sub: session.user.id,
      username: session.user.username,
      businessId: session.user.businessId,
      branchId: session.user.branchId,
      roleId: session.user.roleId,
      sessionId: session.id,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.update({
        where: { id: session.id },
        data: {
          refreshToken: await this.hashToken(tokens.refreshToken),
          expiresAt: this.getRefreshTokenExpiryDate(),
          status: SessionStatus.ACTIVE,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.TOKEN_REFRESH,
        businessId: session.user.businessId,
        userId: session.user.id,
        entity: 'UserSession',
        entityId: session.id,
        description: 'Refresh token rotated successfully',
        ipAddress,
      });
    });

    return tokens;
  }

  async requestPasswordReset(
    dto: ForgotPasswordDto,
    request: Request,
  ): Promise<{
    success: true;
    message: string;
    expiresInMinutes: number;
    deliveryChannel?: PasswordResetChannel;
    devToken?: string;
  }> {
    const genericResponse = this.passwordResetRequestedResponse();
    const identifier = dto.emailOrPhone.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
      select: {
        id: true,
        businessId: true,
        email: true,
        phone: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      return genericResponse;
    }

    const channel = this.resolvePasswordResetChannel(dto, identifier, user);
    const destination =
      channel === PasswordResetChannel.EMAIL ? user.email : user.phone;

    if (!destination) {
      return genericResponse;
    }

    const token = this.generateResetToken();
    const expiresAt = this.getPasswordResetExpiryDate();

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: await this.hashToken(token),
          channel,
          destination,
          ipAddress: this.getIpAddress(request),
          userAgent: request.get('user-agent'),
          expiresAt,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.PASSWORD_RESET,
        businessId: user.businessId,
        userId: user.id,
        entity: 'PasswordResetToken',
        entityId: user.id,
        description: `Password reset requested by ${channel}`,
        ipAddress: this.getIpAddress(request),
      });
    });

    const delivery = await this.passwordResetDeliveryService.deliver({
      channel,
      destination,
      token,
      expiresAt,
    });

    return {
      ...genericResponse,
      deliveryChannel: channel,
      ...(delivery.devToken ? { devToken: delivery.devToken } : {}),
    };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    request: Request,
  ): Promise<{ success: true }> {
    const identifier = dto.emailOrPhone.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
      select: {
        id: true,
        businessId: true,
        password: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const tokens = await this.prisma.passwordResetToken.findMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const matchedToken = await this.findMatchingResetToken(
      dto.token.trim(),
      tokens,
    );

    if (!matchedToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordReusesExistingHash = await verifyPassword(
      dto.newPassword,
      user.password,
    );

    if (passwordReusesExistingHash) {
      throw new BadRequestException('New password must be different');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: await this.hashToken(dto.newPassword),
        },
      });

      await tx.passwordResetToken.update({
        where: { id: matchedToken.id },
        data: { usedAt: new Date() },
      });

      await tx.userSession.updateMany({
        where: { userId: user.id, status: SessionStatus.ACTIVE },
        data: {
          refreshToken: '',
          status: SessionStatus.REVOKED,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.PASSWORD_RESET,
        businessId: user.businessId,
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        description: `Password reset completed at ${new Date().toISOString()}`,
        ipAddress: this.getIpAddress(request),
      });
    });

    return { success: true };
  }

  async logout(
    user: AuthenticatedUser,
    request: Request,
  ): Promise<{ success: true }> {
    if (!user.sessionId) {
      return { success: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.updateMany({
        where: { id: user.sessionId, status: SessionStatus.ACTIVE },
        data: {
          refreshToken: '',
          status: SessionStatus.REVOKED,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.LOGOUT,
        businessId: user.businessId,
        userId: user.id,
        entity: 'UserSession',
        entityId: user.sessionId!,
        description: `User logged out at ${new Date().toISOString()}`,
        ipAddress: this.getIpAddress(request),
      });
    });

    return { success: true };
  }

  async logoutAll(
    user: AuthenticatedUser,
    request: Request,
  ): Promise<{ success: true }> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.updateMany({
        where: { userId: user.id, status: SessionStatus.ACTIVE },
        data: {
          refreshToken: '',
          status: SessionStatus.REVOKED,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.LOGOUT,
        businessId: user.businessId,
        userId: user.id,
        entity: 'UserSession',
        entityId: user.sessionId ?? user.id,
        description: `User logged out from all devices at ${new Date().toISOString()}`,
        ipAddress: this.getIpAddress(request),
      });
    });

    return { success: true };
  }

  async getCurrentUser(user: AuthenticatedUser): Promise<CurrentUserProfile> {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        profileImage: true,
        status: true,
        businessId: true,
        branchId: true,
        roleId: true,
        lastLogin: true,
        business: {
          select: {
            id: true,
            name: true,
            about: true,
            email: true,
            phone: true,
            logo: true,
            address: true,
            currency: true,
            timezone: true,
            status: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
        },
        employee: {
          select: {
            id: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            rolePermissions: {
              select: {
                permission: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!profile || profile.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return {
      user: {
        id: profile.id,
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone,
        profileImage: profile.profileImage,
        status: profile.status,
        businessId: profile.businessId,
        branchId: profile.branchId,
        roleId: profile.roleId,
        roleName: profile.role?.name ?? null,
        employeeId: profile.employee?.id ?? null,
        lastLogin: profile.lastLogin,
      },
      business: profile.business,
      branch: profile.branch,
      role: profile.role
        ? {
            id: profile.role.id,
            name: profile.role.name,
            description: profile.role.description,
          }
        : null,
      permissions:
        profile.role?.rolePermissions.map(
          (rolePermission) => rolePermission.permission.name,
        ) ?? [],
      session: {
        id: user.sessionId,
      },
    };
  }

  async getCurrentUserPermissions(user: AuthenticatedUser): Promise<{
    role: CurrentUserProfile['role'];
    roles: string[];
    permissions: string[];
  }> {
    const profile = await this.getCurrentUser(user);

    return {
      role: profile.role,
      roles: profile.role ? [profile.role.name] : [],
      permissions: profile.permissions,
    };
  }

  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
    request: Request,
  ): Promise<{ success: true }> {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        businessId: true,
        password: true,
        status: true,
      },
    });

    if (!existingUser || existingUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid authentication token');
    }

    const currentPasswordMatches = await verifyPassword(
      dto.currentPassword,
      existingUser.password,
    );

    if (!currentPasswordMatches) {
      throw new ForbiddenException('Current password is incorrect');
    }

    const passwordReusesExistingHash = await verifyPassword(
      dto.newPassword,
      existingUser.password,
    );

    if (passwordReusesExistingHash) {
      throw new BadRequestException('New password must be different');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: await this.hashToken(dto.newPassword),
        },
      });

      await tx.userSession.updateMany({
        where: {
          userId: user.id,
          status: SessionStatus.ACTIVE,
          NOT: user.sessionId ? { id: user.sessionId } : undefined,
        },
        data: {
          refreshToken: '',
          status: SessionStatus.REVOKED,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.PASSWORD_CHANGED,
        businessId: existingUser.businessId,
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        description: `Password changed at ${new Date().toISOString()}`,
        ipAddress: this.getIpAddress(request),
      });
    });

    return { success: true };
  }

  async getSessions(user: AuthenticatedUser): Promise<{
    data: {
      id: string;
      deviceName: string | null;
      deviceId: string | null;
      deviceType: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      status: SessionStatus;
      expiresAt: Date;
      loginAt: Date;
      lastActivityAt: Date;
      isCurrent: boolean;
    }[];
  }> {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        deviceId: true,
        deviceType: true,
        ipAddress: true,
        userAgent: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      data: sessions.map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        deviceId: session.deviceId,
        deviceType: session.deviceType,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        status: session.status,
        expiresAt: session.expiresAt,
        loginAt: session.createdAt,
        lastActivityAt: session.updatedAt,
        isCurrent: session.id === user.sessionId,
      })),
    };
  }

  async revokeSession(
    user: AuthenticatedUser,
    sessionId: string,
    request: Request,
  ): Promise<{ success: true; revokedCurrentSession: boolean }> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== user.id) {
      throw new ForbiddenException('You cannot revoke this session');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.update({
        where: { id: sessionId },
        data: {
          refreshToken: '',
          status: SessionStatus.REVOKED,
        },
      });

      await this.createAuditLog(tx, {
        action: AuditAction.SESSION_REVOKED,
        businessId: user.businessId,
        userId: user.id,
        entity: 'UserSession',
        entityId: sessionId,
        description: `Session revoked at ${new Date().toISOString()}`,
        ipAddress: this.getIpAddress(request),
      });
    });

    return {
      success: true,
      revokedCurrentSession: sessionId === user.sessionId,
    };
  }

  private passwordResetRequestedResponse(): {
    success: true;
    message: string;
    expiresInMinutes: number;
  } {
    return {
      success: true,
      message: 'If an account exists, a password reset token has been sent.',
      expiresInMinutes: this.configService.get<number>(
        'PASSWORD_RESET_TOKEN_TTL_MINUTES',
        15,
      ),
    };
  }

  private resolvePasswordResetChannel(
    dto: ForgotPasswordDto,
    identifier: string,
    user: { email: string | null; phone: string | null },
  ): PasswordResetChannel {
    if (dto.channel) {
      return dto.channel;
    }

    if (user.email && user.email.toLowerCase() === identifier.toLowerCase()) {
      return PasswordResetChannel.EMAIL;
    }

    return PasswordResetChannel.SMS;
  }

  private generateResetToken(): string {
    return randomInt(100000, 1000000).toString();
  }

  private getPasswordResetExpiryDate(): Date {
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() +
        this.configService.get<number>('PASSWORD_RESET_TOKEN_TTL_MINUTES', 15),
    );
    return expiresAt;
  }

  private async findMatchingResetToken(
    plainToken: string,
    tokens: { id: string; tokenHash: string }[],
  ): Promise<{ id: string } | null> {
    for (const token of tokens) {
      if (await verifyPassword(plainToken, token.tokenHash)) {
        return { id: token.id };
      }
    }

    return null;
  }

  private async createTokenPair(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_ACCESS_EXPIRES_IN',
        ) as never,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ) as never,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async hashToken(token: string): Promise<string> {
    return hashPassword(
      token,
      this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12),
    );
  }

  private splitFullName(fullName: string): [string, string] {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts.shift() ?? 'Business';
    const lastName = parts.join(' ') || 'Owner';

    return [firstName, lastName];
  }

  private generateBranchCode(businessName: string): string {
    const prefix =
      businessName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6) || 'BRANCH';
    const suffix = randomInt(1000, 10000);

    return `${prefix}-${suffix}`;
  }

  private async generateUsername(ownerEmail: string): Promise<string> {
    const base =
      ownerEmail
        .split('@')[0]
        ?.toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 40) || 'owner';

    let candidate = base;
    let counter = 1;

    while (
      await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      })
    ) {
      counter += 1;
      candidate = `${base}${counter}`;
    }

    return candidate;
  }

  private getRefreshTokenExpiryDate(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    return expiresAt;
  }

  private assertUserCanLogin(
    user: Pick<LoginUser, 'status' | 'employee'>,
  ): void {
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    if (!user.employee) {
      throw new UnauthorizedException('Employee profile is required to login');
    }

    if (user.employee.status !== 'ACTIVE' || !user.employee.canLogin) {
      throw new UnauthorizedException(
        'Employee account is not allowed to login',
      );
    }
  }

  private async createAuditLog(
    tx: Prisma.TransactionClient,
    data: {
      action: AuditAction;
      businessId: string;
      userId: string;
      entity: string;
      entityId: string;
      description: string;
      ipAddress?: string;
      deviceId?: string;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        businessId: data.businessId,
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        description: data.description,
        ipAddress: data.ipAddress,
        deviceId: data.deviceId,
      },
    });
  }

  private async auditFailedLogin(
    userId: string,
    businessId: string,
    request?: Request,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        entityId: userId,
        description: 'Failed login attempt',
        ipAddress: request ? this.getIpAddress(request) : undefined,
        deviceId: this.getDeviceId(request),
      },
    });
  }

  private getIpAddress(request: Request): string | undefined {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0];
    }

    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim();
    }

    return request.ip;
  }

  private getDeviceId(request?: Request): string | undefined {
    const deviceId = request?.headers['x-device-id'];

    if (Array.isArray(deviceId)) {
      return deviceId[0];
    }

    return deviceId;
  }
}
