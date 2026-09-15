import type { Request, Response, NextFunction } from 'express';
import type {
  ApiResponse,
  AuthResponse,
  AuthTokens,
  AuthUser,
  LogoutResponse,
} from '@teamtrack/shared-types';
import {
  validateRegisterRequest,
  validateLoginRequest,
  validateRefreshRequest,
} from '@teamtrack/validation';
import { config } from '../../config/index.js';
import { authService, type RequestMetadata } from './auth.service.js';
import { AuthError } from './auth.error.js';

const REFRESH_COOKIE_NAME = 'teamtrack_rt';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getClientMetadata(req: Request): RequestMetadata {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
  };
}

function isWebRequest(req: Request): boolean {
  // If client provides cookie or specifies platform as web, treat as Web
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) {
    return true;
  }
  const clientPlatform = (req.headers['x-client-platform'] as string)?.toLowerCase();
  if (clientPlatform === 'web') {
    return true;
  }
  // If request body contains device.platform === 'web'
  if (req.body?.device?.platform === 'web') {
    return true;
  }
  // If no refreshToken in body, assume web
  if (!req.body?.refreshToken) {
    return true;
  }
  return false;
}

function validateOrigin(req: Request): boolean {
  const origin = req.headers['origin'];
  if (!origin) {
    // Non-browser or direct curl/mobile requests may not send Origin
    return true;
  }
  return config.cors.origins.includes(origin);
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/api/v1/auth',
    maxAge: SEVEN_DAYS_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/api/v1/auth',
  });
}

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      if (!validateOrigin(req)) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Untrusted origin' },
        });
        return;
      }

      const validation = validateRegisterRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: validation.errors[0] || {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
          },
        });
        return;
      }

      const meta = getClientMetadata(req);
      const result = await authService.register(validation.data, meta);

      const isWeb = isWebRequest(req);

      const tokens: AuthTokens = {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        tokenType: 'Bearer',
      };

      if (isWeb) {
        setRefreshCookie(res, result.refreshToken);
        // Explicitly omit refreshToken from JSON for Web
      } else {
        tokens.refreshToken = result.refreshToken;
      }

      const responseBody: ApiResponse<AuthResponse> = {
        success: true,
        data: {
          user: result.user,
          tokens,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(responseBody);
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      if (!validateOrigin(req)) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Untrusted origin' },
        });
        return;
      }

      const validation = validateLoginRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: validation.errors[0] || {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
          },
        });
        return;
      }

      const meta = getClientMetadata(req);
      const result = await authService.login(validation.data, meta);

      const isWeb = isWebRequest(req);

      const tokens: AuthTokens = {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        tokenType: 'Bearer',
      };

      if (isWeb) {
        setRefreshCookie(res, result.refreshToken);
      } else {
        tokens.refreshToken = result.refreshToken;
      }

      const responseBody: ApiResponse<AuthResponse> = {
        success: true,
        data: {
          user: result.user,
          tokens,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(responseBody);
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      if (!validateOrigin(req)) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Untrusted origin' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check cookie first (Web), then request body (Desktop/Mobile)
      const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME];
      const bodyValidation = validateRefreshRequest(req.body);

      const refreshToken = cookieToken || (bodyValidation.isValid ? bodyValidation.data.refreshToken : undefined);

      if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Refresh token is missing or invalid',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const isWeb = Boolean(cookieToken) || isWebRequest(req);
      const meta = getClientMetadata(req);

      const result = await authService.rotateRefreshToken(refreshToken, meta);

      const tokens: AuthTokens = {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        tokenType: 'Bearer',
      };

      if (isWeb) {
        setRefreshCookie(res, result.refreshToken);
      } else {
        tokens.refreshToken = result.refreshToken;
      }

      const responseBody: ApiResponse<{ tokens: AuthTokens }> = {
        success: true,
        data: {
          tokens,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(responseBody);
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME];
      const bodyToken = req.body?.refreshToken;
      const token = cookieToken || bodyToken;

      if (token && typeof token === 'string') {
        await authService.logout(token);
      }

      clearRefreshCookie(res);

      const responseBody: ApiResponse<LogoutResponse> = {
        success: true,
        data: {
          message: 'Logged out successfully',
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(responseBody);
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      if (!authUser?.id) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Not authenticated',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const user = await authService.getCurrentUser(authUser.id);

      const responseBody: ApiResponse<{ user: AuthUser }> = {
        success: true,
        data: { user },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(responseBody);
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  private handleError(err: any, res: Response): void {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Generic unhandled error - mask details to avoid leaking internal error details
    console.error('[Auth Internal Error]:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected authentication error occurred',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export const authController = new AuthController();
