import type { PushProvider } from '@teamtrack/shared-types';
import type { PushProviderClient } from './push-provider.interface.js';
import { FCMPushProvider } from './fcm.provider.js';
import { APNsPushProvider } from './apns.provider.js';

export class PushProviderRegistry {
  private providers = new Map<PushProvider, PushProviderClient>();

  constructor() {
    this.register(new FCMPushProvider());
    this.register(new APNsPushProvider());
  }

  register(provider: PushProviderClient): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(provider: PushProvider): PushProviderClient | null {
    return this.providers.get(provider) || null;
  }
}

export const pushProviderRegistry = new PushProviderRegistry();
