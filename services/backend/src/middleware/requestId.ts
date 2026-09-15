import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidRequestId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  return SAFE_REQUEST_ID_REGEX.test(id);
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawId = req.headers['x-request-id'] || req.headers['x-correlation-id'];

  let finalRequestId: string;
  if (typeof rawId === 'string' && isValidRequestId(rawId)) {
    finalRequestId = rawId;
  } else {
    finalRequestId = crypto.randomUUID();
  }

  (req as any).id = finalRequestId;
  (req as any).correlationId = finalRequestId;

  res.setHeader('X-Request-Id', finalRequestId);
  res.setHeader('X-Correlation-Id', finalRequestId);

  next();
}
