import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { JwtPayload } from '../types/jwt-payload.type';
import { SessionStatus } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sessionId) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            businessId: true,
            branchId: true,
            roleId: true,
            status: true,
            role: { select: { name: true } },
            employee: {
              select: {
                id: true,
                status: true,
                canLogin: true,
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.status !== SessionStatus.ACTIVE ||
      session.expiresAt <= new Date() ||
      !session.user ||
      session.user.status !== 'ACTIVE' ||
      !session.user.employee ||
      session.user.employee.status !== 'ACTIVE' ||
      !session.user.employee.canLogin
    ) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return {
      id: session.user.id,
      username: session.user.username,
      businessId: session.user.businessId,
      branchId: session.user.branchId,
      roleId: session.user.roleId,
      roleName: session.user.role?.name ?? null,
      employeeId: session.user.employee.id,
      sessionId: payload.sessionId,
    };
  }
}
