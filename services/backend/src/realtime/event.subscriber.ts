import type { RealtimeEnvelope } from '@teamtrack/shared-types';
import { getRedisSubscriber } from './redis.client.js';
import { subscriptionManager } from './subscription.manager.js';
import { REDIS_REALTIME_CHANNEL } from './event.publisher.js';

export class EventSubscriber {
  private isSubscribed = false;

  init(): void {
    const subscriber = getRedisSubscriber();
    if (!subscriber || this.isSubscribed) return;

    subscriber.subscribe(REDIS_REALTIME_CHANNEL, (err) => {
      if (err) {
        console.error('[EventSubscriber] Failed to subscribe to Redis channel:', err.message);
        return;
      }
      this.isSubscribed = true;
      console.log(`[EventSubscriber] Subscribed to Redis channel: ${REDIS_REALTIME_CHANNEL}`);
    });

    subscriber.on('message', (channel, message) => {
      if (channel !== REDIS_REALTIME_CHANNEL) return;

      try {
        const envelope = JSON.parse(message) as RealtimeEnvelope;
        subscriptionManager.broadcast(envelope);
      } catch (err: any) {
        console.error('[EventSubscriber] Malformed realtime event payload received:', err.message);
      }
    });
  }
}

export const eventSubscriber = new EventSubscriber();
