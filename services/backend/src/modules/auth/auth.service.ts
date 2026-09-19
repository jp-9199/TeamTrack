import type {
  AuthUser,
  RegisterRequest,
  LoginRequest,
  DeviceRegistrationInput,
} from '@teamtrack/shared-types';
import { normalizeEmail } from '@teamtrack/validation';
import { withTransaction } from '../../db/pool.js';
import { userRepository, type DbUser } from '../../db/repositories/user.repository.js';
import { credentialRepository } from '../../db/repositories/credential.repository.js';
import { sessionRepository } from '../../db/repositories/session.repository.js';
import { deviceRepository } from '../../db/repositories/device.repository.js';
import { hashPassword, verifyPassword, verifyDummyPassword } from './hasher.js';
import { tokenService } from './token.service.js';
import { AuthError } from './auth.error.js';

export interface ServiceAuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ServiceRefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RequestMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export function toAuthUser(user: DbUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    fullName: user.full_name || null,
    avatarUrl: user.avatar_url || null,
    status: user.status,
    createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
  };
}

export class AuthService {
  /**
   * Registers a new user account, creates credentials, creates session, and issues initial tokens.
   */
  async register(
    input: RegisterRequest,
    meta?: RequestMetadata
  ): Promise<ServiceAuthResult> {
    const email = normalizeEmail(input.email);

    return withTransaction(async (client) => {
      // 1. Application-level check
      const existingUser = await userRepository.findByEmail(email, client);
      if (existingUser) {
        throw new AuthError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists', 409);
      }

      // 2. Hash password with Argon2id
      const passwordHash = await hashPassword(input.password);

      // 3. Insert user record with database-level conflict handling
      let createdUser: DbUser;
      try {
        createdUser = await userRepository.createUser(
          {
            email,
            displayName: input.displayName,
            fullName: input.fullName,
          },
          client
        );
      } catch (dbErr: any) {
        // Handle PostgreSQL unique constraint violation (code 23505)
        if (dbErr?.code === '23505') {
          throw new AuthError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists', 409);
        }
        throw dbErr;
      }

      // 4. Insert password credentials
      await credentialRepository.createCredentials(createdUser.id, passwordHash, client);

      // 5. Generate secure random refresh token and hash
      const rawRefreshToken = tokenService.generateRefreshToken();
      const refreshTokenHash = tokenService.hashRefreshToken(rawRefreshToken);
      const refreshExpiresAt = tokenService.calculateRefreshExpiration();

      // 6. Create session
      const session = await sessionRepository.createSession(
        {
          userId: createdUser.id,
          refreshTokenHash,
          expiresAt: refreshExpiresAt,
          userAgent: meta?.userAgent,
          ipAddress: meta?.ipAddress,
        },
        client
      );

      // 7. Register push device if a valid deviceToken is provided
      if (input.device?.deviceToken && input.device.deviceToken.trim().length > 0) {
        await deviceRepository.registerOrUpdateDevice(
          {
            userId: createdUser.id,
            deviceToken: input.device.deviceToken,
            platform: input.device.platform,
            deviceModel: input.device.deviceModel,
            appVersion: input.device.appVersion,
          },
          client
        );
      }

      // 8. Sign access JWT
      const accessToken = tokenService.signAccessToken({
        userId: createdUser.id,
        sessionId: session.id,
        email: createdUser.email,
      });

      return {
        user: toAuthUser(createdUser),
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: tokenService.getAccessTokenTtlSeconds(),
      };
    });
  }

  /**
   * Authenticates user credentials with timing-attack mitigation and creates a new session.
   */
  async login(
    input: LoginRequest,
    meta?: RequestMetadata
  ): Promise<ServiceAuthResult> {
    const email = normalizeEmail(input.email);

    // 1. Look up user by normalized email
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Execute static dummy Argon2id verification to equalize timing
      await verifyDummyPassword(input.password);
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // 2. Fetch credentials
    const credentials = await credentialRepository.findByUserId(user.id);
    if (!credentials) {
      await verifyDummyPassword(input.password);
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // 3. Verify password hash
    const isValidPassword = await verifyPassword(credentials.password_hash, input.password);
    if (!isValidPassword) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // 4. Account status checks
    if (user.status === 'suspended') {
      throw new AuthError('ACCOUNT_SUSPENDED', 'Your account has been suspended', 403);
    }
    if (user.status === 'deactivated') {
      throw new AuthError('ACCOUNT_DEACTIVATED', 'Your account has been deactivated', 403);
    }

    // 5. Generate tokens and session inside transaction
    return withTransaction(async (client) => {
      const rawRefreshToken = tokenService.generateRefreshToken();
      const refreshTokenHash = tokenService.hashRefreshToken(rawRefreshToken);
      const refreshExpiresAt = tokenService.calculateRefreshExpiration();

      const session = await sessionRepository.createSession(
        {
          userId: user.id,
          refreshTokenHash,
          expiresAt: refreshExpiresAt,
          userAgent: meta?.userAgent,
          ipAddress: meta?.ipAddress,
        },
        client
      );

      // Register push device ONLY when a valid push token is supplied
      if (input.device?.deviceToken && input.device.deviceToken.trim().length > 0) {
        await deviceRepository.registerOrUpdateDevice(
          {
            userId: user.id,
            deviceToken: input.device.deviceToken,
            platform: input.device.platform,
            deviceModel: input.device.deviceModel,
            appVersion: input.device.appVersion,
          },
          client
        );
      }

          const accessToken = tokenService.signAccessToken({
            userId: user.id,
            sessionId: session.id,
            email: user.email,
          });

      return {
        user: toAuthUser(user),
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: tokenService.getAccessTokenTtlSeconds(),
      };
    });
  }

  /**
   * Rotates a refresh token inside a transaction with SELECT FOR UPDATE row locking
   * and strict token reuse detection.
   */
  async rotateRefreshToken(
    rawRefreshToken: string,
    meta?: RequestMetadata
  ): Promise<ServiceRefreshResult> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new AuthError('INVALID_TOKEN', 'Refresh token is required', 401);
    }

    const presentedHash = tokenService.hashRefreshToken(rawRefreshToken);

    return withTransaction(async (client) => {
      // Lock and evaluate session row
      const evaluation = await sessionRepository.lockAndEvaluateSession(client, presentedHash);

      switch (evaluation.type) {
        case 'not_found':
          throw new AuthError('INVALID_TOKEN', 'Invalid refresh token', 401);

        case 'revoked':
          throw new AuthError('SESSION_REVOKED', 'Session has been revoked', 401);

        case 'expired':
          throw new AuthError('TOKEN_EXPIRED', 'Refresh token has expired', 401);

        case 'reuse_detected':
          // Session was already revoked in lockAndEvaluateSession. Alert and return 401.
          console.warn(`[Security Alert] Refresh token reuse detected for session ${evaluation.session.id}!`);
          throw new AuthError('SESSION_REVOKED', 'Session revoked due to refresh token reuse', 401);

        case 'current_valid': {
          const session = evaluation.session;

          // Verify user is still active
          const user = await userRepository.findById(session.user_id, client);
          if (!user || user.status !== 'active') {
            await sessionRepository.revokeSession(session.id, client);
            const errCode = user?.status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'INVALID_TOKEN';
            throw new AuthError(errCode, 'Account is not eligible to refresh sessions', 401);
          }

          // 1. Generate new random refresh token
          const newRawRefreshToken = tokenService.generateRefreshToken();
          // 2. Hash it
          const newHash = tokenService.hashRefreshToken(newRawRefreshToken);

          // 3. Rotate session row atomically (move current to previous, update hash, increment counter, update rotated_at)
          await sessionRepository.rotateSession(client, session.id, presentedHash, newHash);

          // 4. Issue new access JWT
          const accessToken = tokenService.signAccessToken({
            userId: user.id,
            sessionId: session.id,
            email: user.email,
          });

          return {
            accessToken,
            refreshToken: newRawRefreshToken,
            expiresIn: tokenService.getAccessTokenTtlSeconds(),
          };
        }
      }
    });
  }

  /**
   * Revokes the user's active session.
   */
  async logout(rawRefreshToken?: string, sessionId?: string): Promise<void> {
    if (rawRefreshToken) {
      const hash = tokenService.hashRefreshToken(rawRefreshToken);
      await sessionRepository.revokeByTokenHash(hash);
    } else if (sessionId) {
      await sessionRepository.revokeSession(sessionId);
    }
  }

  /**
   * Resolves the authenticated user by ID.
   */
  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new AuthError('INVALID_TOKEN', 'User not found or inactive', 401);
    }
    return toAuthUser(user);
  }
}

export const authService = new AuthService();
