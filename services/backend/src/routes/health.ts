import { Router, Request, Response } from 'express';
import type { ApiHealthResponse, ApiReadyResponse } from '@teamtrack/shared-types';
import { checkDatabaseHealth } from '../db/pool.js';
import { isRedisConnected } from '../realtime/redis.client.js';
import { config } from '../config/index.js';
import { isShuttingDown } from '../observability/shutdown.js';

export const healthRouter = Router();

const livenessHandler = (_req: Request, res: Response) => {
  const healthResponse: ApiHealthResponse = {
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(healthResponse);
};

const readinessHandler = async (_req: Request, res: Response) => {
  if (isShuttingDown()) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'backend',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'down',
        redis: 'degraded',
      },
    });
    return;
  }

  const isDbHealthy = await checkDatabaseHealth(2000);
  const redisState = isRedisConnected()
    ? 'up'
    : config.redis.url
      ? 'degraded'
      : 'not_configured';

  const readyResponse: ApiReadyResponse = {
    status: isDbHealthy ? 'ready' : 'unhealthy',
    service: 'backend',
    timestamp: new Date().toISOString(),
    checks: {
      database: isDbHealthy ? 'up' : 'down',
      redis: redisState,
    },
  };

  if (!isDbHealthy) {
    res.status(503).json(readyResponse);
    return;
  }

  res.status(200).json(readyResponse);
};

// Root mounts
healthRouter.get('/', livenessHandler);
healthRouter.get('/health', livenessHandler);
healthRouter.get('/live', livenessHandler);
healthRouter.get('/ready', readinessHandler);

// API v1 prefix mounts
healthRouter.get('/api/v1/health', livenessHandler);
healthRouter.get('/api/v1/live', livenessHandler);
healthRouter.get('/api/v1/ready', readinessHandler);
