import type { Request, Response, NextFunction } from 'express';
import { logger } from '../observability/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = (req as any).id || (req.headers['x-request-id'] as string) || 'none';

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;

    // Skip health check spam in development if configured
    if (req.path === '/health' || req.path === '/live') {
      return;
    }

    const logMeta = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      durationMs,
      ip: req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim(),
    };

    if (statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.path} ${statusCode} in ${durationMs}ms`, logMeta);
    } else if (statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.path} ${statusCode} in ${durationMs}ms`, logMeta);
    } else {
      logger.info(`HTTP ${req.method} ${req.path} ${statusCode} in ${durationMs}ms`, logMeta);
    }
  });

  next();
}
