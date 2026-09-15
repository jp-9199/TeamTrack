import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { userService, UserServiceError } from '../src/modules/users/user.service.js';
import { userRepository, type DbUser } from '../src/db/repositories/user.repository.js';
import { sessionRepository, type DbUserSession } from '../src/db/repositories/session.repository.js';
import { credentialRepository } from '../src/db/repositories/credential.repository.js';
import { auditLogRepository } from '../src/db/repositories/auditLog.repository.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/modules/auth/hasher.js';

describe('Phase 13: User Profile, Security & Session Management', () => {
  let memoryUsers: Map<string, DbUser>;
  let memoryCredentials: Map<string, { passwordHash: string; algorithm: string }>;
  let memorySessions: Map<string, DbUserSession>;
  let memoryAuditLogs: any[];

  beforeEach(async () => {
    memoryUsers = new Map();
    memoryCredentials = new Map();
    memorySessions = new Map();
    memoryAuditLogs = [];

    const passwordHash = await hashPassword('CurrentPassword123!');

    const userAlice: DbUser = {
      id: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Original',
      full_name: 'Alice In Chains',
      avatar_url: null,
      timezone: 'UTC',
      locale: 'en-US',
      job_title: 'Staff Architect',
      status: 'active',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      deleted_at: null,
    };

    const userBob: DbUser = {
      id: 'user-bob',
      email: 'bob@example.com',
      display_name: 'Bob Original',
      full_name: null,
      avatar_url: null,
      timezone: 'UTC',
      locale: 'en-US',
      job_title: null,
      status: 'active',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      deleted_at: null,
    };

    memoryUsers.set(userAlice.id, userAlice);
    memoryUsers.set(userBob.id, userBob);

    memoryCredentials.set(userAlice.id, { passwordHash, algorithm: 'argon2id' });
    memoryCredentials.set(userBob.id, { passwordHash, algorithm: 'argon2id' });

    // Sessions for Alice
    memorySessions.set('sess-alice-current', {
      id: 'sess-alice-current',
      user_id: userAlice.id,
      device_id: 'dev-1',
      user_agent: 'Chrome Desktop',
      ip_address: '10.0.0.1',
      refresh_token_hash: 'hash-1',
      expires_at: new Date(Date.now() + 86400000),
      created_at: new Date(),
      rotated_at: new Date(),
      revoked_at: null,
    });

    memorySessions.set('sess-alice-other', {
      id: 'sess-alice-other',
      user_id: userAlice.id,
      device_id: 'dev-2',
      user_agent: 'Mobile Safari',
      ip_address: '10.0.0.2',
      refresh_token_hash: 'hash-2',
      expires_at: new Date(Date.now() + 86400000),
      created_at: new Date(),
      rotated_at: new Date(),
      revoked_at: null,
    });

    // Session for Bob
    memorySessions.set('sess-bob', {
      id: 'sess-bob',
      user_id: userBob.id,
      device_id: 'dev-3',
      user_agent: 'Firefox',
      ip_address: '10.0.0.3',
      refresh_token_hash: 'hash-3',
      expires_at: new Date(Date.now() + 86400000),
      created_at: new Date(),
      rotated_at: new Date(),
      revoked_at: null,
    });

    // Mock pool.connect to support offline withTransaction
    pool.connect = (async () => {
      return {
        query: async () => ({ rows: [] }),
        release: () => {},
      } as any;
    }) as any;

    // Wire repository mocks
    userRepository.findById = async (id: string) => memoryUsers.get(id) || null;
    userRepository.updateProfile = async (id: string, updates: any) => {
      const u = memoryUsers.get(id);
      if (!u) return null;
      if (updates.displayName !== undefined) u.display_name = updates.displayName;
      if (updates.fullName !== undefined) u.full_name = updates.fullName;
      if (updates.avatarUrl !== undefined) u.avatar_url = updates.avatarUrl;
      if (updates.timezone !== undefined) u.timezone = updates.timezone;
      if (updates.locale !== undefined) u.locale = updates.locale;
      if (updates.jobTitle !== undefined) u.job_title = updates.jobTitle;
      u.updated_at = new Date();
      return u;
    };
    userRepository.getUserSecuritySummary = async (userId: string) => {
      const u = memoryUsers.get(userId);
      if (!u) return null;
      const activeCount = Array.from(memorySessions.values()).filter(
        (s) => s.user_id === userId && s.revoked_at === null
      ).length;
      return {
        created_at: u.created_at,
        last_login_at: new Date(),
        active_session_count: activeCount,
        active_device_count: activeCount,
        status: u.status,
      };
    };

    // sessionRepository mocks
    sessionRepository.findById = async (sessionId: string) => {
      return memorySessions.get(sessionId) || null;
    };
    sessionRepository.findActiveSessionsByUserId = async (userId: string) => {
      return Array.from(memorySessions.values()).filter(
        (s) => s.user_id === userId && s.revoked_at === null
      );
    };
    sessionRepository.revokeSessionForUser = async (userId: string, sessionId: string) => {
      const s = memorySessions.get(sessionId);
      if (!s || s.user_id !== userId || s.revoked_at !== null) return false;
      s.revoked_at = new Date();
      return true;
    };
    sessionRepository.revokeAllSessionsForUser = async (userId: string, exceptSessionId?: string) => {
      let count = 0;
      for (const s of memorySessions.values()) {
        if (s.user_id === userId && s.revoked_at === null && s.id !== exceptSessionId) {
          s.revoked_at = new Date();
          count++;
        }
      }
      return count;
    };

    // credentialRepository mocks
    credentialRepository.findByUserId = async (userId: string) => {
      const cred = memoryCredentials.get(userId);
      if (!cred) return null;
      return {
        id: 'cred-' + userId,
        user_id: userId,
        password_hash: cred.passwordHash,
        algorithm: cred.algorithm,
        created_at: new Date(),
        updated_at: new Date(),
      };
    };
    credentialRepository.updatePassword = async (userId: string, newHash: string) => {
      memoryCredentials.set(userId, { passwordHash: newHash, algorithm: 'argon2id' });
    };

    // audit log mock
    auditLogRepository.logAudit = async (data: any) => {
      memoryAuditLogs.push(data);
      return { id: 'audit-' + memoryAuditLogs.length, ...data, created_at: new Date() };
    };
  });

  describe('1. User Profile Management', () => {
    it('retrieves authenticated user profile correctly', async () => {
      const profile = await userService.getProfile('user-alice');
      assert.strictEqual(profile.id, 'user-alice');
      assert.strictEqual(profile.email, 'alice@example.com');
      assert.strictEqual(profile.displayName, 'Alice Original');
      assert.strictEqual(profile.jobTitle, 'Staff Architect');
      assert.strictEqual(profile.timezone, 'UTC');
      assert.strictEqual(profile.locale, 'en-US');
    });

    it('updates allowed user profile fields (displayName, jobTitle, timezone, locale)', async () => {
      const updated = await userService.updateProfile('user-alice', {
        displayName: 'Alice Cooper',
        jobTitle: 'VP of Engineering',
        timezone: 'America/New_York',
        locale: 'en-US',
      });

      assert.strictEqual(updated.displayName, 'Alice Cooper');
      assert.strictEqual(updated.jobTitle, 'VP of Engineering');
      assert.strictEqual(updated.timezone, 'America/New_York');
      assert.strictEqual(updated.locale, 'en-US');

      // Verify persistence in memory
      const persisted = memoryUsers.get('user-alice');
      assert.strictEqual(persisted?.display_name, 'Alice Cooper');
    });

    it('throws USER_NOT_FOUND if user does not exist', async () => {
      await assert.rejects(
        async () => {
          await userService.getProfile('non-existent-user');
        },
        (err: UserServiceError) => {
          assert.strictEqual(err.code, 'USER_NOT_FOUND');
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });
  });

  describe('2. User Security & Password Management', () => {
    it('returns safe security summary without exposing secrets', async () => {
      const sec = await userService.getSecurityInfo('user-alice');
      assert.strictEqual(sec.status, 'active');
      assert.strictEqual(sec.activeSessionCount, 2);
      assert.strictEqual((sec as any).password_hash, undefined);
      assert.strictEqual((sec as any).passwordHash, undefined);
      assert.strictEqual((sec as any).refreshToken, undefined);
    });

    it('changes password with valid current password and revokes all other sessions', async () => {
      await userService.changePassword(
        'user-alice',
        'sess-alice-current',
        {
          currentPassword: 'CurrentPassword123!',
          newPassword: 'BrandNewSecurePassword456!',
        }
      );

      // Current session must remain active
      const currentSess = memorySessions.get('sess-alice-current');
      assert.strictEqual(currentSess?.revoked_at, null);

      // Other session must be revoked
      const otherSess = memorySessions.get('sess-alice-other');
      assert.notStrictEqual(otherSess?.revoked_at, null);

      // Unrelated user session must NOT be affected
      const bobSess = memorySessions.get('sess-bob');
      assert.strictEqual(bobSess?.revoked_at, null);

      // Audit log must have been recorded
      const audit = memoryAuditLogs.find((a) => a.action === 'USER_PASSWORD_CHANGED');
      assert.ok(audit);
      assert.strictEqual(audit.actorId, 'user-alice');
      assert.strictEqual(audit.entityType, 'user');
      assert.strictEqual(audit.entityId, 'user-alice');
    });

    it('rejects password change if current password is wrong', async () => {
      await assert.rejects(
        async () => {
          await userService.changePassword(
            'user-alice',
            'sess-alice-current',
            {
              currentPassword: 'WrongPassword!',
              newPassword: 'BrandNewSecurePassword456!',
            }
          );
        },
        (err: UserServiceError) => {
          assert.strictEqual(err.code, 'INVALID_CURRENT_PASSWORD');
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });

    it('rejects password change if new password is identical to current password', async () => {
      await assert.rejects(
        async () => {
          await userService.changePassword(
            'user-alice',
            'sess-alice-current',
            {
              currentPassword: 'CurrentPassword123!',
              newPassword: 'CurrentPassword123!',
            }
          );
        },
        (err: UserServiceError) => {
          assert.strictEqual(err.code, 'PASSWORD_REUSE_FORBIDDEN');
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  describe('3. Session Management & IDOR Protection', () => {
    it('lists only active sessions for the calling user', async () => {
      const sessions = await userService.listSessions('user-alice', 'sess-alice-current');
      assert.strictEqual(sessions.length, 2);

      const current = sessions.find((s) => s.id === 'sess-alice-current');
      assert.ok(current);
      assert.strictEqual(current?.isCurrent, true);

      const other = sessions.find((s) => s.id === 'sess-alice-other');
      assert.ok(other);
      assert.strictEqual(other?.isCurrent, false);

      // Bob's session must NOT appear
      assert.ok(!sessions.some((s) => s.id === 'sess-bob'));
    });

    it('revokes a specific session belonging to the caller', async () => {
      await userService.revokeSession('user-alice', 'sess-alice-other');
      const s = memorySessions.get('sess-alice-other');
      assert.notStrictEqual(s?.revoked_at, null);

      const audit = memoryAuditLogs.find((a) => a.action === 'USER_SESSION_REVOKED');
      assert.ok(audit);
    });

    it('rejects revoking another user session (cross-user IDOR protection)', async () => {
      await assert.rejects(
        async () => {
          // Alice attempts to revoke Bob's session
          await userService.revokeSession('user-alice', 'sess-bob');
        },
        (err: UserServiceError) => {
          assert.strictEqual(err.code, 'SESSION_NOT_FOUND');
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );

      // Bob's session must remain active
      const bobSess = memorySessions.get('sess-bob');
      assert.strictEqual(bobSess?.revoked_at, null);
    });

    it('revokeAllSessions revokes other sessions while preserving current session', async () => {
      const result = await userService.revokeAllSessions('user-alice', 'sess-alice-current');
      assert.strictEqual(result.revokedCount, 1);

      assert.strictEqual(memorySessions.get('sess-alice-current')?.revoked_at, null);
      assert.notStrictEqual(memorySessions.get('sess-alice-other')?.revoked_at, null);

      const audit = memoryAuditLogs.find((a) => a.action === 'USER_SESSIONS_REVOKED_ALL');
      assert.ok(audit);
    });
  });
});
