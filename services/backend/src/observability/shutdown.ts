import { logger } from './logger.js';

let _isShuttingDown = false;

export function isShuttingDown(): boolean {
  return _isShuttingDown;
}

export function markShuttingDown(): void {
  _isShuttingDown = true;
}

/**
 * Registers SIGTERM and SIGINT handlers for graceful server shutdown.
 *
 * Shutdown order (per plan):
 *  1. Mark server as shutting down (reject new HTTP + WS connections).
 *  2. Stop accepting HTTP traffic (server.close()).
 *  3. Close all active WebSocket connections with code 1001 (Going Away).
 *  4. Disconnect Redis clients cleanly.
 *  5. Drain and close the PostgreSQL pool.
 *  6. Force exit after SHUTDOWN_TIMEOUT_MS if still alive.
 */
export function registerShutdownHandlers(
  httpServer: import('http').Server | null,
  shutdownTimeoutMs = 10_000
): void {
  // Lazy imports to avoid circular dependency at startup
  const handleSignal = async (signal: string) => {
    if (_isShuttingDown) {
      logger.warn(`Received ${signal} again during shutdown — ignoring`);
      return;
    }

    logger.info(`Received ${signal} — initiating graceful shutdown`, { signal });
    _isShuttingDown = true;

    // Hard-exit after timeout boundary
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit', {
        timeoutMs: shutdownTimeoutMs,
      });
      process.exit(1);
    }, shutdownTimeoutMs);
    forceExitTimer.unref();

    try {
      // Step 1: Stop accepting new HTTP connections
      await new Promise<void>((resolve) => {
        if (httpServer) {
          httpServer.close((err) => {
            if (err) {
              logger.warn('HTTP server close error', { error: err.message });
            } else {
              logger.info('HTTP server closed — no new connections accepted');
            }
            resolve();
          });
        } else {
          resolve();
        }
      });

      // Step 2: Close all active WebSocket connections (1001 = Going Away)
      try {
        const { webSocketServer } = await import('../realtime/index.js');
        webSocketServer.close();
        logger.info('WebSocket server closed');
      } catch (wsErr: any) {
        logger.warn('WebSocket server close error', { error: wsErr.message });
      }

      // Step 3: Disconnect Redis clients
      try {
        const { closeRedis } = await import('../realtime/redis.client.js');
        await closeRedis();
        logger.info('Redis clients disconnected');
      } catch (redisErr: any) {
        logger.warn('Redis disconnect error', { error: redisErr.message });
      }

      // Step 4: Close the PostgreSQL pool
      try {
        const { closePool } = await import('../db/pool.js');
        await closePool();
        logger.info('PostgreSQL pool closed');
      } catch (dbErr: any) {
        logger.warn('PostgreSQL pool close error', { error: dbErr.message });
      }

      clearTimeout(forceExitTimer);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err: any) {
      logger.error('Unexpected error during shutdown', { error: err.message });
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('SIGINT', () => handleSignal('SIGINT'));
}
