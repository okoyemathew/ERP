import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { finalize, Observable } from 'rxjs';

type LoggedRequest = {
  method: string;
  path: string;
  route?: { path?: unknown };
};

@Injectable()
export class PerformanceLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpPerformance');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (process.env.PERFORMANCE_LOGGING !== 'true') return next.handle();
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<LoggedRequest>();
    const response = http.getResponse<Response>();
    const matchedRoute = request.route?.path;
    const route =
      typeof matchedRoute === 'string'
        ? matchedRoute
        : request.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            kind: 'http_request',
            method: request.method,
            route,
            status: response.statusCode,
            durationMs: Date.now() - startedAt,
            responseBytes: response.getHeader('content-length') ?? null,
          }),
        );
      }),
    );
  }
}
