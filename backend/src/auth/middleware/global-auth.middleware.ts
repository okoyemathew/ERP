import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestUserInterface } from '../interfaces/request-user.interface';

@Injectable()
export class GlobalAuthMiddleware implements NestMiddleware {
  use(
    request: RequestUserInterface,
    response: Response,
    next: NextFunction,
  ): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    response.setHeader('Cache-Control', 'no-store');
    next();
  }
}
