import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const requestBodyLimit = configService.get<string>(
    'REQUEST_BODY_LIMIT',
    '1mb',
  );

  if (configService.get<boolean>('TRUST_PROXY', isProduction)) {
    const expressApp = app.getHttpAdapter().getInstance() as {
      set(name: string, value: unknown): void;
    };
    expressApp.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(json({ limit: requestBodyLimit, type: 'application/json' }));
  app.use(urlencoded({ extended: true, limit: requestBodyLimit }));
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const allowedOrigins = parseOrigins(
        configService.get<string>('CORS_ORIGINS'),
      );

      if (!isProduction && allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin is not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Device-Id',
      'X-Requested-With',
    ],
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  if (configService.get<boolean>('SWAGGER_ENABLED', !isProduction)) {
    const config = new DocumentBuilder()
      .setTitle('Smart POS Backend')
      .setDescription(
        'Business setup, dashboard, configuration, and audit APIs',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3000);
  const host = configService.get<string>('HOST', '0.0.0.0');

  try {
    await app.listen(port, host);
    logger.log(`Backend listening on http://${host}:${port}`);
  } catch (error) {
    if (
      port === 3000 &&
      error instanceof Error &&
      'code' in error &&
      error.code === 'EADDRINUSE'
    ) {
      const fallbackPort = 3030;
      logger.warn(`Port ${port} is in use. Retrying on port ${fallbackPort}.`);
      await app.listen(fallbackPort, host);
      logger.log(`Backend listening on http://${host}:${fallbackPort}`);
      return;
    }

    throw error;
  }
}

function parseOrigins(origins?: string): string[] {
  return (origins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

void bootstrap();
