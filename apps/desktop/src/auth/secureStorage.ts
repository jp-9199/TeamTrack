import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export class SecureStorageUnavailableError extends Error {
  constructor(message = 'Electron safeStorage encryption is not available on this platform') {
    super(message);
    this.name = 'SecureStorageUnavailableError';
    Object.setPrototypeOf(this, SecureStorageUnavailableError.prototype);
  }
}

export interface DesktopSecureStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  removeRefreshToken(): Promise<void>;
}

const TOKEN_FILE_NAME = 'session_rt.enc';

function getTokenFilePath(): string {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, TOKEN_FILE_NAME);
}

function isSafeStorageAvailable(): boolean {
  try {
    return Boolean(
      safeStorage &&
      typeof safeStorage.isEncryptionAvailable === 'function' &&
      safeStorage.isEncryptionAvailable()
    );
  } catch {
    return false;
  }
}

export class ElectronSecureStorage implements DesktopSecureStorage {
  /**
   * Retrieves the decrypted refresh token from OS-backed safeStorage.
   * Returns null if no token is saved.
   * Throws SecureStorageUnavailableError if safeStorage encryption is not available.
   */
  async getRefreshToken(): Promise<string | null> {
    if (!isSafeStorageAvailable()) {
      throw new SecureStorageUnavailableError();
    }

    const filePath = getTokenFilePath();
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const encryptedBuffer = await fs.promises.readFile(filePath);
      return safeStorage.decryptString(encryptedBuffer);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      console.error('[Desktop SecureStorage] Error decrypting token:', err.message);
      throw err;
    }
  }

  /**
   * Encrypts and persists the refresh token using OS-backed safeStorage.
   * Throws SecureStorageUnavailableError if safeStorage encryption is not available.
   * Never falls back to plaintext.
   */
  async setRefreshToken(token: string): Promise<void> {
    if (!isSafeStorageAvailable()) {
      throw new SecureStorageUnavailableError();
    }

    if (!token || typeof token !== 'string') {
      throw new Error('Invalid token provided to setRefreshToken');
    }

    const filePath = getTokenFilePath();
    const encryptedBuffer = safeStorage.encryptString(token);
    await fs.promises.writeFile(filePath, encryptedBuffer, { mode: 0o600 });
  }

  /**
   * Securely removes the stored encrypted refresh token.
   */
  async removeRefreshToken(): Promise<void> {
    const filePath = getTokenFilePath();
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('[Desktop SecureStorage] Error removing token:', err.message);
        throw err;
      }
    }
  }
}

export const desktopSecureStorage = new ElectronSecureStorage();
