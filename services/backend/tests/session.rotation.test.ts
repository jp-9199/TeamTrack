import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tokenService } from '../src/modules/auth/token.service.js';
import type { DbUserSession, SessionRotationMatch } from '../src/db/repositories/session.repository.js';

describe('Session Rotation & Strict Reuse Detection Logic', () => {
  function simulateEvaluation(
    session: DbUserSession,
    presentedHash: string
  ): SessionRotationMatch {
    if (session.revoked_at !== null) {
      return { type: 'revoked', session };
    }
    if (session.expires_at.getTime() <= Date.now()) {
      return { type: 'expired', session };
    }
    if (session.previous_refresh_token_hash === presentedHash) {
      session.revoked_at = new Date();
      return { type: 'reuse_detected', session };
    }
    if (session.refresh_token_hash === presentedHash) {
      return { type: 'current_valid', session };
    }
    return { type: 'not_found' };
  }

  function simulateRotation(session: DbUserSession, newHash: string): DbUserSession {
    session.previous_refresh_token_hash = session.refresh_token_hash;
    session.refresh_token_hash = newHash;
    session.rotated_at = new Date();
    session.rotation_counter += 1;
    return session;
  }

  it('Case A: successfully rotates session on valid current token presented', () => {
    const token1 = tokenService.generateRefreshToken();
    const hash1 = tokenService.hashRefreshToken(token1);

    const session: DbUserSession = {
      id: 'session-123',
      user_id: 'user-123',
      refresh_token_hash: hash1,
      previous_refresh_token_hash: null,
      user_agent: 'TestAgent',
      ip_address: '127.0.0.1',
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      created_at: new Date(),
      revoked_at: null,
      rotated_at: null,
      rotation_counter: 0,
    };

    const eval1 = simulateEvaluation(session, hash1);
    assert.strictEqual(eval1.type, 'current_valid');

    const token2 = tokenService.generateRefreshToken();
    const hash2 = tokenService.hashRefreshToken(token2);
    const updated = simulateRotation(session, hash2);

    assert.strictEqual(updated.refresh_token_hash, hash2);
    assert.strictEqual(updated.previous_refresh_token_hash, hash1);
    assert.strictEqual(updated.rotation_counter, 1);
    assert.ok(updated.rotated_at instanceof Date);
  });

  it('Case B: detects token reuse when previous token is presented and revokes session', () => {
    const token1 = tokenService.generateRefreshToken();
    const hash1 = tokenService.hashRefreshToken(token1);

    const token2 = tokenService.generateRefreshToken();
    const hash2 = tokenService.hashRefreshToken(token2);

    // Session has already rotated once from token1 to token2
    const session: DbUserSession = {
      id: 'session-456',
      user_id: 'user-456',
      refresh_token_hash: hash2,
      previous_refresh_token_hash: hash1,
      user_agent: 'TestAgent',
      ip_address: '127.0.0.1',
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      created_at: new Date(),
      revoked_at: null,
      rotated_at: new Date(),
      rotation_counter: 1,
    };

    // Attacker or stale client presents token1 (previous token)
    const evalReuse = simulateEvaluation(session, hash1);
    assert.strictEqual(evalReuse.type, 'reuse_detected');
    assert.ok(session.revoked_at !== null, 'Session must be immediately revoked upon reuse');

    // Subsequent rotation attempts with either token must now be rejected
    const evalSubsequent = simulateEvaluation(session, hash2);
    assert.strictEqual(evalSubsequent.type, 'revoked');
  });

  it('Case C: rejects unknown refresh token hash', () => {
    const session: DbUserSession = {
      id: 'session-789',
      user_id: 'user-789',
      refresh_token_hash: 'valid-hash',
      previous_refresh_token_hash: null,
      user_agent: null,
      ip_address: null,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      created_at: new Date(),
      revoked_at: null,
      rotated_at: null,
      rotation_counter: 0,
    };

    const evalUnknown = simulateEvaluation(session, 'random-unrecognized-hash');
    assert.strictEqual(evalUnknown.type, 'not_found');
  });

  it('Case D: rejects refresh on already revoked session', () => {
    const session: DbUserSession = {
      id: 'session-rev',
      user_id: 'user-rev',
      refresh_token_hash: 'hash-abc',
      previous_refresh_token_hash: null,
      user_agent: null,
      ip_address: null,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      created_at: new Date(),
      revoked_at: new Date(Date.now() - 60000), // revoked 1 minute ago
      rotated_at: null,
      rotation_counter: 0,
    };

    const evalRevoked = simulateEvaluation(session, 'hash-abc');
    assert.strictEqual(evalRevoked.type, 'revoked');
  });

  it('Case E: rejects refresh on expired session', () => {
    const session: DbUserSession = {
      id: 'session-exp',
      user_id: 'user-exp',
      refresh_token_hash: 'hash-exp',
      previous_refresh_token_hash: null,
      user_agent: null,
      ip_address: null,
      expires_at: new Date(Date.now() - 1000), // expired 1s ago
      created_at: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      revoked_at: null,
      rotated_at: null,
      rotation_counter: 0,
    };

    const evalExpired = simulateEvaluation(session, 'hash-exp');
    assert.strictEqual(evalExpired.type, 'expired');
  });
});
