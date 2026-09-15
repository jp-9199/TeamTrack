import * as crypto from 'crypto';
import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import type { AccessTokenPayload } from '@teamtrack/shared-types';
import { config } from '../../config/index.js';

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  expiresIn: number;
  refreshExpiresAt: Date;
}

export class TokenService {
  /**
   * Generates a high-entropy random refresh token string: 48 bytes hex (96 characters).
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  /**
   * Computes SHA-256 hash of a refresh token for storage and lookup.
   */
  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Calculates the expiration date for a new refresh token based on configured TTL (e.g. '7d').
   */
  calculateRefreshExpiration(): Date {
    const ttlStr = config.jwt.refreshTokenTtl;
    let days = 7;
    if (ttlStr.endsWith('d')) {
      const parsed = parseInt(ttlStr.slice(0, -1), 10);
      if (!isNaN(parsed) && parsed > 0) days = parsed;
    }
    const ms = days * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms);
  }

  /**
   * Parses access token TTL string (e.g. '15m') into seconds.
   */
  getAccessTokenTtlSeconds(): number {
    const ttlStr = config.jwt.accessTokenTtl;
    if (ttlStr.endsWith('m')) {
      const minutes = parseInt(ttlStr.slice(0, -1), 10);
      if (!isNaN(minutes) && minutes > 0) return minutes * 60;
    }
    if (ttlStr.endsWith('s')) {
      const seconds = parseInt(ttlStr.slice(0, -1), 10);
      if (!isNaN(seconds) && seconds > 0) return seconds;
    }
    if (ttlStr.endsWith('h')) {
      const hours = parseInt(ttlStr.slice(0, -1), 10);
      if (!isNaN(hours) && hours > 0) return hours * 3600;
    }
    return 900; // 15 minutes default
  }

  /**
   * Issues a signed access JWT with strict claims and explicit algorithm.
   */
  signAccessToken(params: {
    userId: string;
    sessionId: string;
    email: string;
  }): string {
    const payload: Omit<AccessTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
      sub: params.userId,
      sid: params.sessionId,
      email: params.email,
      role: 'user',
    };

    const options: SignOptions = {
      algorithm: 'HS256',
      expiresIn: this.getAccessTokenTtlSeconds(),
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    };

    return jwt.sign(payload, config.jwt.secret, options);
  }

  /**
   * Verifies access JWT with algorithm whitelist, issuer, and audience validation.
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    const options: VerifyOptions = {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      complete: false,
    };

    const decoded = jwt.verify(token, config.jwt.secret, options) as unknown as AccessTokenPayload;

    if (!decoded.sub || !decoded.sid || !decoded.email) {
      throw new Error('INVALID_TOKEN: Missing required JWT claims');
    }

    return decoded;
  }
}

export const tokenService = new TokenService();
