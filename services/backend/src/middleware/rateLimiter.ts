import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { config } from '../config/index.js';

let redisClient: Redis | null = null;
let isRedisConnected = false;

if (config.redis.url) {
  try {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.connect().then(() => {
      isRedisConnected = true;
      console.log('[RateLimiter] Connected to Redis authority.');
    }).catch((err) => {
      isRedisConnected = false;
      console.warn('[RateLimiter] Redis connection failed:', err.message);
    });

    redisClient.on('error', (err) => {
      isRedisConnected = false;
      console.error('[RateLimiter] Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
    });
  } catch (err: any) {
    console.warn('[RateLimiter] Could not initialize Redis client:', err.message);
  }
}

interface MemoryBucket {
  timestamps: number[];
}

const inMemoryBuckets = new Map<string, MemoryBucket>();

// Prune memory buckets every 5 minutes in test/dev
if (!config.isProduction) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of inMemoryBuckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < 3600 * 1000);
      if (bucket.timestamps.length === 0) {
        inMemoryBuckets.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();
}

export interface RateLimitOptions {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  return async function rateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    const key = `${options.keyPrefix}:${ip}`;

    // 1. Production Mode: Redis is mandatory authority unless ALLOW_MEMORY_FALLBACK is explicitly enabled
    if (config.isProduction && process.env.ALLOW_MEMORY_FALLBACK !== 'true') {
      if (!redisClient || !isRedisConnected) {
        console.error(
          `[CRITICAL ALERT] Redis unavailable in production! Failing closed on rate-limited endpoint ${options.keyPrefix}`
        );
        res.status(503).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Service temporarily unable to process request due to rate limit verification failure',
          },
        });
        return;
      }

      try {
        const currentCount = await redisClient.incr(key);
        if (currentCount === 1) {
          await redisClient.expire(key, options.windowSeconds);
        }

        if (currentCount > options.limit) {
          res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests. Please try again later.',
            },
          });
          return;
        }

        next();
        return;
      } catch (err: any) {
        console.error('[RateLimiter Redis Query Error]:', err.message);
        res.status(503).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit verification error',
          },
        });
        return;
      }
    }

    // 2. Local Dev / Test Mode: Allowed in-memory fallback
    if (redisClient && isRedisConnected) {
      try {
        const currentCount = await redisClient.incr(key);
        if (currentCount === 1) {
          await redisClient.expire(key, options.windowSeconds);
        }

        if (currentCount > options.limit) {
          res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests. Please try again later.',
            },
          });
          return;
        }

        next();
        return;
      } catch {
        // Fall back to memory in dev/test if Redis fails
      }
    }

    if (config.rateLimit.allowMemoryFallback) {
      const now = Date.now();
      const windowMs = options.windowSeconds * 1000;
      let bucket = inMemoryBuckets.get(key);

      if (!bucket) {
        bucket = { timestamps: [] };
        inMemoryBuckets.set(key, bucket);
      }

      // Sliding window filter
      bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

      if (bucket.timestamps.length >= options.limit) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
          },
        });
        return;
      }

      bucket.timestamps.push(now);
      next();
      return;
    }

    // Strict non-production fallback denial if fallback disallowed
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limiting unavailable',
      },
    });
  };
}

/**
 * Register rate limit: 5 per 1 hour per IP
 */
export const registerRateLimiter = createRateLimiter({
  keyPrefix: 'rl:auth:register',
  limit: 5,
  windowSeconds: 3600,
});

/**
 * Login rate limit: 10 per 15 minutes per IP
 */
export const loginRateLimiter = createRateLimiter({
  keyPrefix: 'rl:auth:login:ip',
  limit: 10,
  windowSeconds: 900,
});

/**
 * Refresh rate limit: 30 per 1 minute per IP
 */
export const refreshRateLimiter = createRateLimiter({
  keyPrefix: 'rl:auth:refresh',
  limit: 30,
  windowSeconds: 60,
});

/**
 * Helper to check and record failed login attempts per account email hash
 */
export async function checkAndRecordFailedAccountLogin(
  normalizedEmail: string
): Promise<boolean> {
  const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
  const key = `rl:auth:login:account:${emailHash}`;
  const maxAttempts = 5;
  const windowSeconds = 900;

  if (config.isProduction && (!redisClient || !isRedisConnected)) {
    return false; // Fail closed
  }

  if (redisClient && isRedisConnected) {
    try {
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, windowSeconds);
      }
      return count <= maxAttempts;
    } catch {
      return false;
    }
  }

  if (config.rateLimit.allowMemoryFallback) {
    const now = Date.now();
    let bucket = inMemoryBuckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      inMemoryBuckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowSeconds * 1000);
    bucket.timestamps.push(now);
    return bucket.timestamps.length <= maxAttempts;
  }

  return false;
}
