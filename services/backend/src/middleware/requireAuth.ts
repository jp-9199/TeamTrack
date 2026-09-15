import type { Request, Response, NextFunction } from 'express';
import type { AccessTokenPayload } from '@teamtrack/shared-types';
import { tokenService } from '../modules/auth/token.service.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    sessionId: string;
    email: string;
    role: 'user';
  };
}

/**
 * Validates the cryptographically signed JWT access token in the Authorization header.
 * Rejects tokens in query parameters, request bodies, or unverified formats.
 *
 * NOTE ON REVOCATION & EXPIRATION:
 * Access tokens are short-lived (15 minutes) signed assertions. Cryptographic verification
 * is performed in-memory without a database roundtrip on standard endpoints to ensure high throughput.
 * When a session is revoked or logged out, the refresh token cannot be rotated again.
 * The currently held 15-minute access token naturally expires within 15 minutes.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Missing or malformed Authorization header',
      },
    });
    return;
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Authorization header format must be Bearer <token>',
      },
    });
    return;
  }

  const token = parts[1];

  try {
    const payload: AccessTokenPayload = tokenService.verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      sessionId: payload.sid,
      email: payload.email,
      role: 'user', // strictly enforced by backend
    };

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired',
        },
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid access token',
      },
    });
  }
}
