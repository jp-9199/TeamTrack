import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BACKEND_PORT,
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  DEFAULT_JWT_ISSUER,
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_REQUEST_BODY_LIMIT,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  DEFAULT_DB_POOL_MAX,
  DEFAULT_DB_IDLE_TIMEOUT_MS,
  DEFAULT_DB_CONNECTION_TIMEOUT_MS,
  DEFAULT_DB_STATEMENT_TIMEOUT_MS,
  DEFAULT_LOG_LEVEL,
  ENV_KEYS,
} from '@teamtrack/config';

// Load .env automatically if present
for (const envPath of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
]) {
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch {
      // ignore
    }
  }
}


export interface BackendConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  databaseUrl: string;
  // Convenience top-level aliases for common server settings
  shutdownTimeoutMs: number;
  requestBodyLimit: string;
  jwt: {
    secret: string;
    accessTokenTtl: string;
    refreshTokenTtl: string;
    issuer: string;
    audience: string;
  };
  cookies: {
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
  };
  redis: {
    url?: string;
  };
  cors: {
    origins: string[];
  };
  rateLimit: {
    allowMemoryFallback: boolean;
  };
  storage: {
    driver: 's3' | 'mock';
    s3: {
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle: boolean;
    };
  };
  logging: {
    level: string;
    format: 'json' | 'text';
  };
  database: {
    poolMax: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    statementTimeoutMs: number;
  };
  server: {
    shutdownTimeoutMs: number;
    requestBodyLimit: string;
  };
}

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function validateProductionConfig(cfg: BackendConfig): void {
  if (!cfg.isProduction) return;

  // 1. JWT Secret strength
  if (!cfg.jwt.secret || cfg.jwt.secret.length < 32 || cfg.jwt.secret.includes('insecure') || cfg.jwt.secret.includes('dev')) {
    throw new Error(
      'FATAL: ACCESS_TOKEN_SECRET must be configured with at least 32 cryptographically secure characters in production.'
    );
  }

  // 2. Storage driver production invariants
  if (cfg.storage.driver === 'mock') {
    if (process.env.ALLOW_MOCK_STORAGE !== 'true' && !process.env.STORAGE_DRIVER) {
      console.warn('[Storage] Notice: Running with mock storage driver. Set STORAGE_DRIVER=s3 and S3_BUCKET if persistent cloud storage is desired.');
    }
  }

  if (cfg.storage.driver === 's3') {
    if (!cfg.storage.s3.bucket) {
      throw new Error('FATAL: S3_BUCKET is required when STORAGE_DRIVER is s3 in production.');
    }
  }

  // 3. Database URL invariant
  if (!cfg.databaseUrl || cfg.databaseUrl.includes('teamtrack:teamtrack@localhost')) {
    throw new Error('FATAL: DATABASE_URL must be explicitly configured with production credentials.');
  }
}

function resolveConfig(): BackendConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const secret = process.env[ENV_KEYS.ACCESS_TOKEN_SECRET] || (isProduction ? '' : 'dev-insecure-secret-key-32-chars-min!!');

  const cookieSecureEnv = process.env[ENV_KEYS.COOKIE_SECURE];
  const cookieSecure = cookieSecureEnv !== undefined
    ? cookieSecureEnv === 'true'
    : isProduction;

  const cookieSameSiteEnv = (process.env[ENV_KEYS.COOKIE_SAME_SITE] || 'lax').toLowerCase();
  const validSameSite = ['lax', 'strict', 'none'] as const;
  const sameSite = validSameSite.includes(cookieSameSiteEnv as any)
    ? (cookieSameSiteEnv as 'lax' | 'strict' | 'none')
    : 'lax';

  const cfg: BackendConfig = {
    port: Number(process.env.PORT) || DEFAULT_BACKEND_PORT,
    nodeEnv,
    isProduction,
    databaseUrl: process.env[ENV_KEYS.DATABASE_URL] || 'postgresql://teamtrack:teamtrack@localhost:5432/teamtrack_dev',
    jwt: {
      secret,
      accessTokenTtl: process.env[ENV_KEYS.ACCESS_TOKEN_TTL] || DEFAULT_ACCESS_TOKEN_TTL,
      refreshTokenTtl: process.env[ENV_KEYS.REFRESH_TOKEN_TTL] || DEFAULT_REFRESH_TOKEN_TTL,
      issuer: process.env[ENV_KEYS.ACCESS_TOKEN_ISSUER] || DEFAULT_JWT_ISSUER,
      audience: process.env[ENV_KEYS.ACCESS_TOKEN_AUDIENCE] || DEFAULT_JWT_AUDIENCE,
    },
    cookies: {
      secure: cookieSecure,
      sameSite,
    },
    redis: {
      url: process.env[ENV_KEYS.REDIS_URL],
    },
    cors: {
      origins: parseCorsOrigins(process.env[ENV_KEYS.CORS_ORIGIN]),
    },
    rateLimit: {
      allowMemoryFallback:
        process.env.ALLOW_MEMORY_FALLBACK === 'true' ||
        !process.env[ENV_KEYS.REDIS_URL] ||
        !isProduction,
    },
    storage: {
      driver:
        (process.env[ENV_KEYS.STORAGE_DRIVER] as any) ||
        (process.env[ENV_KEYS.S3_BUCKET] ? 's3' : 'mock'),
      s3: {
        bucket: process.env[ENV_KEYS.S3_BUCKET] || (isProduction ? '' : 'teamtrack-uploads-dev'),
        region: process.env[ENV_KEYS.S3_REGION] || 'us-east-1',
        endpoint: process.env[ENV_KEYS.S3_ENDPOINT],
        accessKeyId: process.env[ENV_KEYS.S3_ACCESS_KEY_ID],
        secretAccessKey: process.env[ENV_KEYS.S3_SECRET_ACCESS_KEY],
        forcePathStyle: process.env[ENV_KEYS.S3_FORCE_PATH_STYLE] === 'true',
      },
    },
    logging: {
      level: process.env[ENV_KEYS.LOG_LEVEL] || DEFAULT_LOG_LEVEL,
      format: (process.env[ENV_KEYS.LOG_FORMAT] as any) || (isProduction ? 'json' : 'text'),
    },
    database: {
      poolMax: Number(process.env[ENV_KEYS.DB_POOL_MAX]) || DEFAULT_DB_POOL_MAX,
      idleTimeoutMs: DEFAULT_DB_IDLE_TIMEOUT_MS,
      connectionTimeoutMs: DEFAULT_DB_CONNECTION_TIMEOUT_MS,
      statementTimeoutMs: Number(process.env[ENV_KEYS.DB_STATEMENT_TIMEOUT_MS]) || DEFAULT_DB_STATEMENT_TIMEOUT_MS,
    },
    server: {
      shutdownTimeoutMs: Number(process.env[ENV_KEYS.SHUTDOWN_TIMEOUT_MS]) || DEFAULT_SHUTDOWN_TIMEOUT_MS,
      requestBodyLimit: process.env[ENV_KEYS.REQUEST_BODY_LIMIT] || DEFAULT_REQUEST_BODY_LIMIT,
    },
    // Convenience top-level aliases
    get shutdownTimeoutMs() {
      return this.server.shutdownTimeoutMs;
    },
    get requestBodyLimit() {
      return this.server.requestBodyLimit;
    },
  } as BackendConfig;

  if (isProduction) {
    validateProductionConfig(cfg);
  }

  return cfg;
}

export const config = resolveConfig();

