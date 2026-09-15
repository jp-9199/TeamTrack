import { describe, it } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { tokenService } from '../src/modules/auth/token.service.js';
import { config } from '../src/config/index.js';

describe('TokenService (JWT & Refresh Token Architecture)', () => {
  it('generates high entropy 96-character hex refresh token', () => {
    const token1 = tokenService.generateRefreshToken();
    const token2 = tokenService.generateRefreshToken();

    assert.strictEqual(token1.length, 96, '48 random bytes hex should be 96 characters');
    assert.strictEqual(token2.length, 96);
    assert.notStrictEqual(token1, token2, 'Consecutive refresh tokens must be unique');
  });

  it('computes deterministic SHA-256 hash for refresh token', () => {
    const token = 'sample-random-refresh-token-value';
    const hash1 = tokenService.hashRefreshToken(token);
    const hash2 = tokenService.hashRefreshToken(token);

    assert.strictEqual(hash1.length, 64, 'SHA-256 hex string should be 64 characters');
    assert.strictEqual(hash1, hash2, 'SHA-256 hash must be deterministic');
  });

  it('signs and verifies a valid access JWT with correct claims', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const sessionId = '22222222-2222-4222-8222-222222222222';
    const email = 'user@teamtrack.dev';

    const token = tokenService.signAccessToken({ userId, sessionId, email });
    assert.ok(typeof token === 'string' && token.length > 0);

    const payload = tokenService.verifyAccessToken(token);
    assert.strictEqual(payload.sub, userId);
    assert.strictEqual(payload.sid, sessionId);
    assert.strictEqual(payload.email, email);
    assert.strictEqual(payload.role, 'user');
    assert.strictEqual(payload.iss, config.jwt.issuer);
    assert.strictEqual(payload.aud, config.jwt.audience);
    assert.ok(typeof payload.exp === 'number');
    assert.ok(typeof payload.iat === 'number');
  });

  it('rejects access token signed with wrong secret', () => {
    const fakeToken = jwt.sign(
      { sub: 'user-id', sid: 'session-id', email: 'a@b.com', role: 'user' },
      'completely-wrong-secret-key-that-should-fail!',
      {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: '15m',
      }
    );

    assert.throws(() => {
      tokenService.verifyAccessToken(fakeToken);
    });
  });

  it('rejects access token with incorrect issuer', () => {
    const badIssuerToken = jwt.sign(
      { sub: 'user-id', sid: 'session-id', email: 'a@b.com', role: 'user' },
      config.jwt.secret,
      {
        issuer: 'malicious-issuer',
        audience: config.jwt.audience,
        expiresIn: '15m',
      }
    );

    assert.throws(() => {
      tokenService.verifyAccessToken(badIssuerToken);
    });
  });

  it('rejects access token with incorrect audience', () => {
    const badAudienceToken = jwt.sign(
      { sub: 'user-id', sid: 'session-id', email: 'a@b.com', role: 'user' },
      config.jwt.secret,
      {
        issuer: config.jwt.issuer,
        audience: 'untrusted-audience',
        expiresIn: '15m',
      }
    );

    assert.throws(() => {
      tokenService.verifyAccessToken(badAudienceToken);
    });
  });

  it('rejects access token missing required sid claim', () => {
    const missingSidToken = jwt.sign(
      { sub: 'user-id', email: 'a@b.com', role: 'user' },
      config.jwt.secret,
      {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: '15m',
      }
    );

    assert.throws(() => {
      tokenService.verifyAccessToken(missingSidToken);
    });
  });

  it('rejects expired access token', () => {
    const expiredToken = jwt.sign(
      { sub: 'user-id', sid: 'session-id', email: 'a@b.com', role: 'user' },
      config.jwt.secret,
      {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: '0s', // Expires immediately
      }
    );

    assert.throws(() => {
      tokenService.verifyAccessToken(expiredToken);
    });
  });
});
