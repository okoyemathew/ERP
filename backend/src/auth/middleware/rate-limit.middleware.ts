import {
  HttpException,
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly authWindowMs: number;
  private readonly authMaxRequests: number;
  private readonly refreshMaxRequests: number;
  private readonly store = new Map<string, RateLimitEntry>();

  constructor(private readonly configService: ConfigService) {
    this.windowMs = this.configService.get<number>(
      'RATE_LIMIT_WINDOW_MS',
      60_000,
    );
    this.maxRequests = this.configService.get<number>('RATE_LIMIT_MAX', 30);
    this.authWindowMs = this.configService.get<number>(
      'AUTH_RATE_LIMIT_WINDOW_MS',
      60_000,
    );
    this.authMaxRequests = this.configService.get<number>(
      'AUTH_RATE_LIMIT_MAX',
      5,
    );
    this.refreshMaxRequests = this.configService.get<number>(
      'REFRESH_RATE_LIMIT_MAX',
      20,
    );
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const policy = this.resolvePolicy(request);

    if (!policy) {
      next();
      return;
    }

    const now = Date.now();
    const key = `${this.getIpAddress(request)}:${request.path}`;
    const entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + policy.windowMs });
      response.setHeader('X-RateLimit-Limit', String(policy.maxRequests));
      response.setHeader(
        'X-RateLimit-Remaining',
        String(policy.maxRequests - 1),
      );
      next();
      return;
    }

    if (entry.count >= policy.maxRequests) {
      response.setHeader(
        'Retry-After',
        String(Math.ceil((entry.resetAt - now) / 1000)),
      );
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    response.setHeader('X-RateLimit-Limit', String(policy.maxRequests));
    response.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(policy.maxRequests - entry.count, 0)),
    );
    next();
  }

  private resolvePolicy(
    request: Request,
  ): { windowMs: number; maxRequests: number } | null {
    if (request.method !== 'POST') {
      return null;
    }

    const path = request.path.replace(/^\/api/, '');

    if (path === '/auth/refresh') {
      return {
        windowMs: this.authWindowMs,
        maxRequests: this.refreshMaxRequests,
      };
    }

    if (
      [
        '/auth/login',
        '/auth/register-owner',
        '/auth/forgot-password',
        '/auth/reset-password',
      ].includes(path)
    ) {
      return {
        windowMs: this.authWindowMs,
        maxRequests: this.authMaxRequests,
      };
    }

    if (path.startsWith('/auth/')) {
      return {
        windowMs: this.windowMs,
        maxRequests: this.maxRequests,
      };
    }

    return null;
  }

  private getIpAddress(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0] ?? request.ip ?? 'unknown';
    }

    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim() ?? request.ip ?? 'unknown';
    }

    return request.ip ?? 'unknown';
  }
}
