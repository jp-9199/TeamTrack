import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
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
    }).catch(() => {
      isRedisConnected = false;
    });

    redisClient.on('error', () => {
      isRedisConnected = false;
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
    });
  } catch {
    // Handled via fallback or fail-closed
  }
}

// In-memory sliding window for development/testing
interface UserRateLimitState {
  timestamps: number[];
  activeRequests: number;
}

const inMemoryStates = new Map<string, UserRateLimitState>();

export const AI_RATE_LIMIT = 20; // 20 requests per minute
export const AI_CONCURRENCY_LIMIT = 2; // max 2 concurrent requests
export const AI_WINDOW_SECONDS = 60;

/**
 * AI Rate Limiter Middleware:
 * Enforces per-user request volume and concurrency limits.
 * In production: Redis authoritative, fail-closed.
 * In test/dev: In-memory sliding window.
 */
export async function aiRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = (req as any).user?.id || req.ip || 'anonymous';
  const rateLimitKey = `rl:ai:req:${userId}`;
  const concurrencyKey = `rl:ai:conc:${userId}`;

  // 1. Production Mode: Redis is mandatory authority unless allowMemoryFallback is enabled
  if (config.isProduction && !config.rateLimit.allowMemoryFallback) {
    if (!redisClient || !isRedisConnected) {
      console.error('[AI RateLimiter] Redis unavailable in production! Failing closed.');
      res.status(503).json({
        success: false,
        error: {
          code: 'AI_RATE_LIMITED',
          message: 'Rate limit authority temporarily unavailable',
        },
      });
      return;
    }

    try {
      // Check concurrency
      const active = await redisClient.incr(concurrencyKey);
      if (active > AI_CONCURRENCY_LIMIT) {
        await redisClient.decr(concurrencyKey);
        res.status(429).json({
          success: false,
          error: {
            code: 'AI_RATE_LIMITED',
            message: `Concurrent AI request limit exceeded (max ${AI_CONCURRENCY_LIMIT})`,
          },
        });
        return;
      }

      // Check request rate
      const count = await redisClient.incr(rateLimitKey);
      if (count === 1) {
        await redisClient.expire(rateLimitKey, AI_WINDOW_SECONDS);
      }

      if (count > AI_RATE_LIMIT) {
        await redisClient.decr(concurrencyKey);
        res.status(429).json({
          success: false,
          error: {
            code: 'AI_RATE_LIMITED',
            message: `AI rate limit exceeded (max ${AI_RATE_LIMIT} requests per minute)`,
          },
        });
        return;
      }

      // Cleanup concurrency counter on finish
      res.on('finish', () => {
        redisClient?.decr(concurrencyKey).catch(() => {});
      });

      next();
      return;
    } catch (err: any) {
      console.error('[AI RateLimiter Redis Error]:', err.message);
      res.status(503).json({
        success: false,
        error: {
          code: 'AI_RATE_LIMITED',
          message: 'Rate limit verification error',
        },
      });
      return;
    }
  }

  // 2. Local Dev / Test Mode: Allowed in-memory fallback
  const now = Date.now();
  let state = inMemoryStates.get(userId);
  if (!state) {
    state = { timestamps: [], activeRequests: 0 };
    inMemoryStates.set(userId, state);
  }

  // Concurrency check
  if (state.activeRequests >= AI_CONCURRENCY_LIMIT) {
    res.status(429).json({
      success: false,
      error: {
        code: 'AI_RATE_LIMITED',
        message: `Concurrent AI request limit exceeded (max ${AI_CONCURRENCY_LIMIT})`,
      },
    });
    return;
  }

  // Sliding window filter
  state.timestamps = state.timestamps.filter((ts) => now - ts < AI_WINDOW_SECONDS * 1000);

  if (state.timestamps.length >= AI_RATE_LIMIT) {
    res.status(429).json({
      success: false,
      error: {
        code: 'AI_RATE_LIMITED',
        message: `AI rate limit exceeded (max ${AI_RATE_LIMIT} requests per minute)`,
      },
    });
    return;
  }

  state.timestamps.push(now);
  state.activeRequests++;

  res.on('finish', () => {
    if (state) {
      state.activeRequests = Math.max(0, state.activeRequests - 1);
    }
  });

  next();
}

/**
 * Test helper to reset rate limiters during automated tests.
 */
export function resetInMemoryRateLimits(): void {
  inMemoryStates.clear();
}
