import { userRepository, type DbUser } from '../../db/repositories/user.repository.js';
import { credentialRepository } from '../../db/repositories/credential.repository.js';
import { sessionRepository, type DbUserSession } from '../../db/repositories/session.repository.js';
import { auditLogRepository } from '../../db/repositories/auditLog.repository.js';
import { hashPassword, verifyPassword } from '../auth/hasher.js';
import { withTransaction } from '../../db/pool.js';
import type {
  UserProfile,
  UpdateUserProfileRequest,
  UserSecuritySummary,
  UserSessionItem,
  ChangePasswordRequest,
} from '@teamtrack/shared-types';
import { PHASE13_ERROR_CODES } from '@teamtrack/shared-types';

export class UserServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

export class UserService {
  mapUserProfile(user: DbUser): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      timezone: user.timezone || null,
      locale: user.locale || null,
      jobTitle: user.job_title || null,
      status: user.status,
      createdAt: user.created_at.toISOString(),
      updatedAt: user.updated_at.toISOString(),
    };
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new UserServiceError(PHASE13_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }
    return this.mapUserProfile(user);
  }

  async updateProfile(userId: string, input: UpdateUserProfileRequest): Promise<UserProfile> {
    const updated = await userRepository.updateProfile(userId, {
      displayName: input.displayName,
      fullName: input.fullName,
      avatarUrl: input.avatarUrl,
      timezone: input.timezone,
      locale: input.locale,
      jobTitle: input.jobTitle,
    });

    if (!updated) {
      throw new UserServiceError(PHASE13_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    await auditLogRepository.logAudit({
      organizationId: null,
      actorId: userId,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'user',
      entityId: userId,
      metadata: {
        fields: Object.keys(input),
      },
    });

    return this.mapUserProfile(updated);
  }

  async getSecurityInfo(userId: string): Promise<UserSecuritySummary> {
    const summary = await userRepository.getUserSecuritySummary(userId);
    if (!summary) {
      throw new UserServiceError(PHASE13_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    return {
      createdAt: summary.created_at.toISOString(),
      lastLoginAt: summary.last_login_at ? summary.last_login_at.toISOString() : null,
      activeSessionCount: summary.active_session_count,
      activeDeviceCount: summary.active_device_count,
      status: summary.status,
    };
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordRequest
  ): Promise<{ message: string }> {
    const credentials = await credentialRepository.findByUserId(userId);
    if (!credentials) {
      throw new UserServiceError(PHASE13_ERROR_CODES.USER_NOT_FOUND, 'User credentials not found', 404);
    }

    const isCurrentValid = await verifyPassword(credentials.password_hash, input.currentPassword);
    if (!isCurrentValid) {
      throw new UserServiceError(
        PHASE13_ERROR_CODES.INVALID_CURRENT_PASSWORD,
        'Invalid current password',
        400
      );
    }

    if (input.currentPassword === input.newPassword) {
      throw new UserServiceError(
        PHASE13_ERROR_CODES.PASSWORD_REUSE_FORBIDDEN,
        'New password must be different from current password',
        400
      );
    }

    const newHash = await hashPassword(input.newPassword);

    await withTransaction(async (client) => {
      // Update password hash in credentials
      await client.query(
        `UPDATE user_credentials SET password_hash = $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, newHash]
      );

      // Invalidate all OTHER sessions for user to protect against compromised credentials
      await sessionRepository.revokeAllSessionsForUser(userId, currentSessionId, client);
    });

    await auditLogRepository.logAudit({
      organizationId: null,
      actorId: userId,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: userId,
      metadata: { preservedSessionId: currentSessionId },
    });

    return { message: 'Password changed successfully. Other active sessions have been revoked.' };
  }

  async listSessions(userId: string, currentSessionId: string): Promise<UserSessionItem[]> {
    const sessions = await sessionRepository.findActiveSessionsByUserId(userId);

    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      createdAt: s.created_at.toISOString(),
      expiresAt: s.expires_at.toISOString(),
      lastActivityAt: (s.rotated_at || s.created_at).toISOString(),
      isCurrent: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ message: string }> {
    const revoked = await sessionRepository.revokeSessionForUser(userId, sessionId);
    if (!revoked) {
      // Check if session exists to provide precise anti-IDOR feedback
      const existing = await sessionRepository.findById(sessionId);
      if (!existing || existing.user_id !== userId) {
        // IDOR protection: do not reveal existence of other users' sessions
        throw new UserServiceError(
          PHASE13_ERROR_CODES.SESSION_NOT_FOUND,
          'Session not found',
          404
        );
      }
      if (existing.revoked_at !== null) {
        throw new UserServiceError(
          PHASE13_ERROR_CODES.SESSION_ALREADY_REVOKED,
          'Session has already been revoked',
          400
        );
      }
      throw new UserServiceError(PHASE13_ERROR_CODES.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    await auditLogRepository.logAudit({
      organizationId: null,
      actorId: userId,
      action: 'USER_SESSION_REVOKED',
      entityType: 'user_session',
      entityId: sessionId,
      metadata: { sessionId },
    });

    return { message: 'Session revoked successfully' };
  }

  async revokeAllSessions(
    userId: string,
    preserveCurrentSessionId?: string
  ): Promise<{ revokedCount: number; message: string }> {
    const count = await sessionRepository.revokeAllSessionsForUser(userId, preserveCurrentSessionId);

    await auditLogRepository.logAudit({
      organizationId: null,
      actorId: userId,
      action: 'USER_SESSIONS_REVOKED_ALL',
      entityType: 'user',
      entityId: userId,
      metadata: {
        revokedCount: count,
        preservedCurrent: Boolean(preserveCurrentSessionId),
      },
    });

    return {
      revokedCount: count,
      message: preserveCurrentSessionId
        ? `Revoked ${count} other sessions successfully`
        : `Revoked ${count} sessions successfully`,
    };
  }
}

export const userService = new UserService();
