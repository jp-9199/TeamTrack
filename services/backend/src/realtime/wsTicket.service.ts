import crypto from 'crypto';
import { config } from '../config/index.js';
import { getRedisPublisher } from './redis.client.js';

export interface WsTicketPayload {
  userId: string;
  sessionId: string;
  expiresAt: number;
}

const TICKET_TTL_SECONDS = 30;

// In-memory fallback for dev/test environments when Redis is unavailable
const memoryTicketStore = new Map<string, WsTicketPayload>();

// Periodic cleanup of expired in-memory tickets
setInterval(() => {
  const now = Date.now();
  for (const [ticket, data] of memoryTicketStore.entries()) {
    if (data.expiresAt < now) {
      memoryTicketStore.delete(ticket);
    }
  }
}, 10000).unref();

export class WsTicketService {
  /**
   * Generates a single-use cryptographically secure ticket bound to a user and session.
   * TTL: 30 seconds.
   */
  async createTicket(userId: string, sessionId: string): Promise<{ ticket: string; expiresAt: string; expiresInSeconds: number }> {
    // 32 bytes = 256 bits of cryptographic entropy
    const ticket = crypto.randomBytes(32).toString('base64url');
    const expiresAtMs = Date.now() + TICKET_TTL_SECONDS * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const payload: WsTicketPayload = {
      userId,
      sessionId,
      expiresAt: expiresAtMs,
    };

    const redis = getRedisPublisher();
    if (redis && redis.status === 'ready') {
      try {
        const key = `ws_ticket:${ticket}`;
        await redis.set(key, JSON.stringify(payload), 'EX', TICKET_TTL_SECONDS);
      } catch (err) {
        memoryTicketStore.set(ticket, payload);
      }
    } else {
      if (config.isProduction) {
        throw new Error('REDIS_UNAVAILABLE: In-memory ticket storage is strictly disallowed in production');
      }
      memoryTicketStore.set(ticket, payload);
    }

    return {
      ticket,
      expiresAt,
      expiresInSeconds: TICKET_TTL_SECONDS,
    };
  }

  /**
   * Atomically consumes a ticket. Returns payload if valid, or null if expired/already used/invalid.
   */
  async consumeTicket(ticket: string): Promise<WsTicketPayload | null> {
    if (!ticket || typeof ticket !== 'string') {
      return null;
    }

    // Fast-path for development demo-tickets
    if (!config.isProduction && (ticket === 'demo-ticket' || ticket.startsWith('demo-ticket'))) {
      return {
        userId: 'a0000000-0000-0000-0000-000000000001',
        sessionId: 'demo-session',
        expiresAt: Date.now() + 86400000,
      };
    }

    const redis = getRedisPublisher();
    if (redis && redis.status === 'ready') {
      try {
        const key = `ws_ticket:${ticket}`;
        // Atomic get-and-delete in Redis 6.2+
        const raw = await redis.getdel(key);
        if (!raw) return null;

        const payload = JSON.parse(raw) as WsTicketPayload;
        if (payload.expiresAt < Date.now()) {
          return null;
        }
        return payload;
      } catch (err) {
        console.warn('Redis getdel ticket error, falling back to memory store:', err);
      }
    }

    if (config.isProduction) {
      return null;
    }
    // In-memory atomic deletion
    const payload = memoryTicketStore.get(ticket);
    if (!payload) return null;

    memoryTicketStore.delete(ticket);

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  }
}

export const wsTicketService = new WsTicketService();
