import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    businessId: string,
    user: AuthenticatedUser,
    query: NotificationQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.NotificationWhereInput = {
      businessId,
      OR: [{ userId: null }, { userId: user.id }],
      ...(query.type ? { type: query.type } : {}),
      ...(query.isRead !== undefined ? { isRead: query.isRead } : {}),
    };

    await this.ensureLowStockNotifications(businessId);

    const [unreadCount, total, notifications] = await Promise.all([
      this.prisma.notification.count({
        where: {
          businessId,
          OR: [{ userId: null }, { userId: user.id }],
          isRead: false,
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      unreadCount,
      data: notifications.map((notification) => this.format(notification)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async markRead(businessId: string, id: string, user: AuthenticatedUser) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        businessId,
        OR: [{ userId: null }, { userId: user.id }],
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return this.format(updated);
  }

  async markAllRead(businessId: string, user: AuthenticatedUser) {
    await this.prisma.notification.updateMany({
      where: {
        businessId,
        OR: [{ userId: null }, { userId: user.id }],
        isRead: false,
      },
      data: { isRead: true },
    });

    return { success: true };
  }

  async createBusinessEvent(data: {
    businessId: string;
    userId?: string | null;
    title: string;
    message: string;
    type?: NotificationType;
  }) {
    return this.prisma.notification.create({
      data: {
        businessId: data.businessId,
        userId: data.userId ?? null,
        title: data.title,
        message: data.message,
        type: data.type ?? NotificationType.INFO,
      },
    });
  }

  async ensureLowStockNotifications(businessId: string) {
    const settings = await this.prisma.notificationSettings.findUnique({
      where: { businessId },
      select: { lowStockAlert: true },
    });

    if (settings && !settings.lowStockAlert) {
      return;
    }

    const lowStock = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; quantityAvailable: number }>
    >`
      SELECT p.id, p.name, COALESCE(i."quantityAvailable", 0)::int AS "quantityAvailable"
      FROM "Product" p
      LEFT JOIN "Inventory" i ON i."productId" = p.id
      WHERE p."businessId" = ${businessId}::uuid
        AND p."isActive" = true
        AND COALESCE(i."quantityAvailable", 0) <= p."minimumStock"
      LIMIT 25
    `;

    for (const product of lowStock) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          businessId,
          title: 'Low stock',
          message: { contains: product.name },
          isRead: false,
        },
      });

      if (!existing) {
        await this.createBusinessEvent({
          businessId,
          title: 'Low stock',
          message: `${product.name} is at ${product.quantityAvailable} units`,
          type: NotificationType.WARNING,
        });
      }
    }
  }

  async notifySaleCompleted(
    businessId: string,
    saleNumber: string,
    amount: Prisma.Decimal | number | string,
  ) {
    await this.createBusinessEvent({
      businessId,
      title: 'Sale completed',
      message: `${saleNumber} completed for ${new Prisma.Decimal(amount).toFixed(2)}`,
      type: NotificationType.SUCCESS,
    });
  }

  async notifyLowStock(
    businessId: string,
    productName: string,
    quantity: number,
  ) {
    await this.createBusinessEvent({
      businessId,
      title: 'Low stock',
      message: `${productName} is at ${quantity} units`,
      type: NotificationType.WARNING,
    });
  }

  private format(notification: {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    isRead: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return notification;
  }
}
