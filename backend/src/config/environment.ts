type Environment = {
  NODE_ENV: string;
  HOST: string;
  PORT: number;
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  BCRYPT_SALT_ROUNDS: number;
  PASSWORD_RESET_TOKEN_TTL_MINUTES: number;
  RESEND_API_KEY?: string;
  PASSWORD_RESET_FROM_EMAIL?: string;
  PASSWORD_RESET_SMS_WEBHOOK_URL?: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  AUTH_RATE_LIMIT_WINDOW_MS: number;
  AUTH_RATE_LIMIT_MAX: number;
  REFRESH_RATE_LIMIT_MAX: number;
  CORS_ORIGINS?: string;
  REQUEST_BODY_LIMIT: string;
  SWAGGER_ENABLED: boolean;
  TRUST_PROXY: boolean;
};

function required(value: string | undefined, key: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function numberFromEnv(
  value: string | undefined,
  key: string,
  defaultValue: number,
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive integer`);
  }

  return parsed;
}

function booleanFromEnv(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function assertProductionSecret(value: string, key: string, nodeEnv: string) {
  if (nodeEnv !== 'production') {
    return;
  }

  if (value.length < 32) {
    throw new Error(`${key} must be at least 32 characters in production`);
  }
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const env = config as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV ?? 'development';
  const accessSecret = required(env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET');
  const refreshSecret = required(env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');

  assertProductionSecret(accessSecret, 'JWT_ACCESS_SECRET', nodeEnv);
  assertProductionSecret(refreshSecret, 'JWT_REFRESH_SECRET', nodeEnv);

  if (nodeEnv === 'production' && accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  if (nodeEnv === 'production' && !env.CORS_ORIGINS?.trim()) {
    throw new Error('CORS_ORIGINS must be set in production');
  }

  return {
    NODE_ENV: nodeEnv,
    HOST: env.HOST ?? '0.0.0.0',
    PORT: numberFromEnv(env.PORT, 'PORT', 3000),
    DATABASE_URL: required(env.DATABASE_URL, 'DATABASE_URL'),
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_EXPIRES_IN: env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    JWT_REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    BCRYPT_SALT_ROUNDS: numberFromEnv(
      env.BCRYPT_SALT_ROUNDS,
      'BCRYPT_SALT_ROUNDS',
      12,
    ),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: numberFromEnv(
      env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
      'PASSWORD_RESET_TOKEN_TTL_MINUTES',
      15,
    ),
    RESEND_API_KEY: env.RESEND_API_KEY,
    PASSWORD_RESET_FROM_EMAIL: env.PASSWORD_RESET_FROM_EMAIL,
    PASSWORD_RESET_SMS_WEBHOOK_URL: env.PASSWORD_RESET_SMS_WEBHOOK_URL,
    RATE_LIMIT_WINDOW_MS: numberFromEnv(
      env.RATE_LIMIT_WINDOW_MS,
      'RATE_LIMIT_WINDOW_MS',
      60_000,
    ),
    RATE_LIMIT_MAX: numberFromEnv(env.RATE_LIMIT_MAX, 'RATE_LIMIT_MAX', 30),
    AUTH_RATE_LIMIT_WINDOW_MS: numberFromEnv(
      env.AUTH_RATE_LIMIT_WINDOW_MS,
      'AUTH_RATE_LIMIT_WINDOW_MS',
      60_000,
    ),
    AUTH_RATE_LIMIT_MAX: numberFromEnv(
      env.AUTH_RATE_LIMIT_MAX,
      'AUTH_RATE_LIMIT_MAX',
      5,
    ),
    REFRESH_RATE_LIMIT_MAX: numberFromEnv(
      env.REFRESH_RATE_LIMIT_MAX,
      'REFRESH_RATE_LIMIT_MAX',
      20,
    ),
    CORS_ORIGINS: env.CORS_ORIGINS,
    REQUEST_BODY_LIMIT: env.REQUEST_BODY_LIMIT ?? '1mb',
    SWAGGER_ENABLED: booleanFromEnv(
      env.SWAGGER_ENABLED,
      nodeEnv !== 'production',
    ),
    TRUST_PROXY: booleanFromEnv(env.TRUST_PROXY, nodeEnv === 'production'),
  };
}
