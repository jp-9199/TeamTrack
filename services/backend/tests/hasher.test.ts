import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  STATIC_DUMMY_ARGON2_HASH,
} from '../src/modules/auth/hasher.js';

describe('Password Hashing & Timing Attack Mitigation', () => {
  it('successfully creates an Argon2id hash with expected prefix', async () => {
    const password = 'StrongPassword123!';
    const hash = await hashPassword(password);

    assert.ok(hash.startsWith('$argon2id$'), 'Hash should start with $argon2id$');
    assert.notStrictEqual(hash, password, 'Hash should not match plaintext password');
  });

  it('correctly verifies a valid password against its hash', async () => {
    const password = 'CorrectHorseBatteryStaple99#';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    assert.strictEqual(isValid, true, 'Valid password should verify as true');
  });

  it('rejects an incorrect password', async () => {
    const password = 'CorrectPassword123!';
    const wrongPassword = 'WrongPassword456!';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, wrongPassword);
    assert.strictEqual(isValid, false, 'Wrong password should verify as false');
  });

  it('verifies static dummy hash returns false without throwing', async () => {
    const result = await verifyDummyPassword('AnyArbitraryPassword123!');
    assert.strictEqual(result, false, 'Dummy verification should always return false');
  });

  it('ensures STATIC_DUMMY_ARGON2_HASH is a valid encoded Argon2id format', () => {
    assert.ok(
      STATIC_DUMMY_ARGON2_HASH.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'),
      'Static dummy hash must have valid Argon2id parameter headers'
    );
  });
});
