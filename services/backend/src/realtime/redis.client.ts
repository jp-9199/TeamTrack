import { Redis } from 'ioredis';
import { config } from '../config/index.js';

let publisherClient: Redis | null = null;
let subscriberClient: Redis | null = null;
let redisAvailable = false;

const retryStrategy = (times: number): number | null => {
  // Bounded exponential backoff: 200ms, 400ms, 600ms … up to 3s
  return Math.min(times * 200, 3000);
};

if (config.redis.url) {
  try {
    publisherClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy,
    });

    subscriberClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy,
    });

    publisherClient.on('connect', () => { redisAvailable = true; });
    publisherClient.on('ready', () => { redisAvailable = true; });
    publisherClient.on('error', (_err) => { redisAvailable = false; });
    publisherClient.on('close', () => { redisAvailable = false; });

    subscriberClient.on('error', (_err) => { redisAvailable = false; });

    // Attempt connecting asynchronously without crashing if offline
    Promise.all([publisherClient.connect(), subscriberClient.connect()])
      .then(() => {
        redisAvailable = true;
        console.log('[Realtime Redis] Connected successfully');
      })
      .catch((err) => {
        redisAvailable = false;
        if (config.isProduction) {
          console.error('[Realtime Redis] FATAL: Production Redis connection failed:', err.message);
        } else {
          console.log('[Realtime Redis] Redis not reachable in dev/test; using local in-memory fallback');
        }
      });
  } catch (err: any) {
    redisAvailable = false;
  }
}

export function getRedisPublisher(): Redis | null {
  return redisAvailable ? publisherClient : null;
}

export function getRedisSubscriber(): Redis | null {
  return redisAvailable ? subscriberClient : null;
}

export function isRedisConnected(): boolean {
  return redisAvailable;
}

/**
 * Gracefully disconnects all Redis clients.
 * Called during ordered shutdown sequence.
 */
export async function closeRedis(): Promise<void> {
  redisAvailable = false;
  const disconnects: Promise<unknown>[] = [];
  if (publisherClient) {
    disconnects.push(publisherClient.quit().catch(() => publisherClient?.disconnect()));
  }
  if (subscriberClient) {
    disconnects.push(subscriberClient.quit().catch(() => subscriberClient?.disconnect()));
  }
  await Promise.allSettled(disconnects);
  publisherClient = null;
  subscriberClient = null;
}
