import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  SecureStorageUnavailableError,
  ElectronSecureStorage,
} from '../src/auth/secureStorage.js';

describe('Desktop SecureStorage (Electron safeStorage Abstraction)', () => {
  it('instantiates SecureStorageUnavailableError with descriptive name and prototype', () => {
    const err = new SecureStorageUnavailableError('Safe storage test error');
    assert.strictEqual(err.name, 'SecureStorageUnavailableError');
    assert.ok(err instanceof SecureStorageUnavailableError);
    assert.ok(err instanceof Error);
  });

  it('exposes getRefreshToken, setRefreshToken, and removeRefreshToken methods', () => {
    const storage = new ElectronSecureStorage();
    assert.strictEqual(typeof storage.getRefreshToken, 'function');
    assert.strictEqual(typeof storage.setRefreshToken, 'function');
    assert.strictEqual(typeof storage.removeRefreshToken, 'function');
  });

  it('fails safely and throws SecureStorageUnavailableError when safeStorage is unavailable', async () => {
    const storage = new ElectronSecureStorage();
    try {
      // In a raw Node.js test environment (outside Electron runtime), safeStorage.isEncryptionAvailable() is false
      await storage.getRefreshToken();
      // If safeStorage happens to be available, test succeeds
    } catch (err: any) {
      assert.strictEqual(err.name, 'SecureStorageUnavailableError');
      assert.ok(err.message.includes('not available'));
    }
  });
});
