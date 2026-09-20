import crypto from 'crypto';
import type { RealtimeEnvelope, RealtimeEventName } from '@teamtrack/shared-types';
import { config } from '../config/index.js';
import { getRedisPublisher } from './redis.client.js';
import { subscriptionManager } from './subscription.manager.js';

export const REDIS_REALTIME_CHANNEL = 'teamtrack:realtime';

export class EventPublisher {
  private listeners = new Map<string, Set<(envelope: RealtimeEnvelope<any>) => void | Promise<void>>>();

  /**
   * Subscribes a local in-process listener to a specific realtime event.
   * Useful for decoupled service-to-service consumers (e.g. calendar listening to meeting events).
   */
  on(event: string, handler: (envelope: RealtimeEnvelope<any>) => void | Promise<void>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /**
   * Publishes a realtime event to Redis fan-out, falling back to local delivery.
   * Post-commit invariant: must ONLY be invoked after PostgreSQL transaction has successfully committed.
   */
  async publish<T>(
    event: RealtimeEventName,
    topic: string,
    payload: T
  ): Promise<RealtimeEnvelope<T>> {
    const envelope: RealtimeEnvelope<T> = {
      eventId: crypto.randomUUID(),
      event,
      topic,
      payload,
      timestamp: new Date().toISOString(),
      version: 1,
    };

    // Invoke in-process decoupled event listeners
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          Promise.resolve(handler(envelope)).catch((err) => {
            console.error(`[EventPublisher] Listener error for ${event}:`, err.message);
          });
        } catch (err: any) {
          console.error(`[EventPublisher] Synchronous listener error for ${event}:`, err.message);
        }
      }
    }

    const redis = getRedisPublisher();
    if (redis) {
      try {
        await redis.publish(REDIS_REALTIME_CHANNEL, JSON.stringify(envelope));
      } catch (err: any) {
        if (config.isProduction && !config.rateLimit.allowMemoryFallback) {
          throw new Error(`REDIS_PUBLISH_FAILED: ${err.message}`);
        }
        console.error('[EventPublisher] Redis publish error, falling back to local delivery:', err.message);
        subscriptionManager.broadcast(envelope);
      }
    } else {
      if (config.isProduction && !config.rateLimit.allowMemoryFallback) {
        throw new Error('REDIS_UNAVAILABLE: In-memory broadcast fallback is strictly disallowed in production');
      }
      // Local in-memory fan-out
      subscriptionManager.broadcast(envelope);
    }

    return envelope;
  }
}

export const eventPublisher = new EventPublisher();
