import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateDisplayName,
  validateRegisterRequest,
  validateLoginRequest,
  validateRefreshRequest,
} from '@teamtrack/validation';

describe('Validation & Normalization (packages/validation)', () => {
  it('correctly normalizes emails by trimming and lowercasing', () => {
    assert.strictEqual(normalizeEmail('  Alice.Smith@Example.COM  '), 'alice.smith@example.com');
  });

  it('validates correct email formats and rejects invalid ones', () => {
    assert.strictEqual(validateEmail('test@teamtrack.dev').isValid, true);
    assert.strictEqual(validateEmail('invalid-email').isValid, false);
    assert.strictEqual(validateEmail('').isValid, false);
  });

  it('enforces password policy (min 8, max 128, upper, lower, number, symbol)', () => {
    // Valid password
    const validRes = validatePassword('SecurePass123!');
    assert.strictEqual(validRes.isValid, true);

    // Too short
    assert.strictEqual(validatePassword('Ab1!').isValid, false);

    // Missing uppercase
    assert.strictEqual(validatePassword('secure123!').isValid, false);

    // Missing lowercase
    assert.strictEqual(validatePassword('SECURE123!').isValid, false);

    // Missing number
    assert.strictEqual(validatePassword('SecurePass!').isValid, false);

    // Missing symbol
    assert.strictEqual(validatePassword('SecurePass123').isValid, false);
  });

  it('validates display name boundaries', () => {
    assert.strictEqual(validateDisplayName('Alice Smith').isValid, true);
    assert.strictEqual(validateDisplayName('').isValid, false);
    assert.strictEqual(validateDisplayName('a'.repeat(101)).isValid, false);
  });

  it('validates registration requests', () => {
    const valid = validateRegisterRequest({
      email: 'ALICE@DOMAIN.COM',
      password: 'Password123!',
      displayName: 'Alice',
    });
    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(valid.data?.email, 'alice@domain.com');

    const invalid = validateRegisterRequest({
      email: 'bad',
      password: 'weak',
      displayName: '',
    });
    assert.strictEqual(invalid.isValid, false);
    assert.ok(invalid.errors.length >= 3);
  });

  it('validates login requests', () => {
    const valid = validateLoginRequest({
      email: 'Bob@Example.COM',
      password: 'SecretPassword123!',
    });
    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(valid.data?.email, 'bob@example.com');

    const missingPass = validateLoginRequest({
      email: 'Bob@Example.COM',
      password: '',
    });
    assert.strictEqual(missingPass.isValid, false);
  });

  it('validates refresh requests', () => {
    const valid = validateRefreshRequest({ refreshToken: 'some-token' });
    assert.strictEqual(valid.isValid, true);

    const empty = validateRefreshRequest({});
    assert.strictEqual(empty.isValid, true); // body refreshToken is optional (Web uses cookie)
  });
});
