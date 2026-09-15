import * as Keychain from 'react-native-keychain';

export interface MobileSecureStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  removeRefreshToken(): Promise<void>;
}

const SERVICE_KEY = 'com.teamtrack.auth.refresh';

export class KeychainSecureStorage implements MobileSecureStorage {
  /**
   * Retrieves the refresh token from hardware-backed iOS Keychain or Android Keystore.
   * Returns null if no token is stored.
   * Never accesses AsyncStorage or unencrypted storage.
   */
  async getRefreshToken(): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({ service: SERVICE_KEY });
      if (credentials && credentials.password) {
        return credentials.password;
      }
      return null;
    } catch (err: any) {
      console.error('[Mobile SecureStorage] Failed to retrieve token from Keychain/Keystore:', err.message);
      return null;
    }
  }

  /**
   * Persists the refresh token into iOS Keychain or Android Keystore with device-only hardware protection.
   */
  async setRefreshToken(token: string): Promise<void> {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid refresh token provided to setRefreshToken');
    }
    try {
      await Keychain.setGenericPassword('teamtrack_session', token, {
        service: SERVICE_KEY,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch (err: any) {
      console.error('[Mobile SecureStorage] Failed to persist token to Keychain/Keystore:', err.message);
      throw err;
    }
  }

  /**
   * Purges the refresh token from iOS Keychain or Android Keystore on logout.
   */
  async removeRefreshToken(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({ service: SERVICE_KEY });
    } catch (err: any) {
      console.error('[Mobile SecureStorage] Failed to reset credentials:', err.message);
      throw err;
    }
  }
}

export const mobileSecureStorage = new KeychainSecureStorage();
