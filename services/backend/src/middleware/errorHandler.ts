import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../observability/logger.js';
import { PHASE14_ERROR_CODES } from '@teamtrack/shared-types';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).id || (req.headers['x-request-id'] as string) || 'none';

  // 1. CORS origin errors
  if (err.message && err.message.startsWith('CORS blocked')) {
    res.status(403).json({
      success: false,
      error: {
        code: PHASE14_ERROR_CODES.FORBIDDEN,
        message: 'CORS origin not allowed',
        requestId,
      },
    });
    return;
  }

  // 2. Body Parser / Payload Too Large
  if (err.type === 'entity.too.large' || err.statusCode === 413 || err.status === 413) {
    res.status(413).json({
      success: false,
      error: {
        code: PHASE14_ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: 'Request payload exceeds maximum allowed size of 1MB',
        requestId,
      },
    });
    return;
  }

  // 3. JSON Syntax Parsing Errors
  if (err instanceof SyntaxError && 'body' in err && (err as any).status === 400) {
    res.status(400).json({
      success: false,
      error: {
        code: PHASE14_ERROR_CODES.BAD_REQUEST,
        message: 'Malformed JSON payload in request body',
        requestId,
      },
    });
    return;
  }

  // 4. Known Domain/Service Errors (e.g. ServiceError, AIServiceError, GovernanceServiceError)
  const statusCode = typeof err.statusCode === 'number'
    ? err.statusCode
    : typeof err.status === 'number'
      ? err.status
      : 500;

  const errorCode = err.code || (statusCode >= 500 ? PHASE14_ERROR_CODES.INTERNAL_ERROR : PHASE14_ERROR_CODES.BAD_REQUEST);

  // In production, sanitize 5xx messages so internal details, SQL, paths, or secrets don't leak
  let clientMessage = err.message || 'Internal server error';
  if (config.isProduction && statusCode >= 500) {
    clientMessage = 'An internal server error occurred';
  } else if (
    clientMessage.includes('password') ||
    clientMessage.includes('token') ||
    clientMessage.includes('SELECT') ||
    clientMessage.includes('INSERT') ||
    clientMessage.includes('UPDATE')
  ) {
    clientMessage = 'A database or security processing error occurred';
  }

  // Log error securely with redaction and request context
  logger.error(`Error handling ${req.method} ${req.path}: ${err.message}`, {
    requestId,
    statusCode,
    errorCode,
    stack: config.isProduction ? undefined : err.stack,
  });

  const responseBody: any = {
    success: false,
    error: {
      code: errorCode,
      message: clientMessage,
      requestId,
    },
  };

  if (!config.isProduction && err.details) {
    responseBody.error.details = err.details;
  }

  res.status(statusCode).json(responseBody);
}
