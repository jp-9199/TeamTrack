import type {
  PushMessage,
  PushProviderClient,
  PushSendResult,
} from './push-provider.interface.js';

export type APNsTransportFn = (
  topic: string,
  token: string,
  payload: Record<string, unknown>
) => Promise<{ status: number; data: any; apnsId?: string }>;

export class APNsPushProvider implements PushProviderClient {
  readonly name = 'apns' as const;
  private keyId: string | undefined;
  private teamId: string | undefined;
  private privateKey: string | undefined;
  private topic: string | undefined;
  private customTransport?: APNsTransportFn;

  constructor(options?: {
    keyId?: string;
    teamId?: string;
    privateKey?: string;
    topic?: string;
    transport?: APNsTransportFn;
  }) {
    this.keyId = options?.keyId || process.env.APNS_KEY_ID;
    this.teamId = options?.teamId || process.env.APNS_TEAM_ID;
    this.privateKey = options?.privateKey || process.env.APNS_PRIVATE_KEY;
    this.topic = options?.topic || process.env.APNS_TOPIC;
    this.customTransport = options?.transport;
  }

  setTransport(transport: APNsTransportFn): void {
    this.customTransport = transport;
  }

  validateConfiguration(): { valid: boolean; reason?: string } {
    if (this.customTransport) {
      return { valid: true };
    }
    if (!this.keyId) {
      return { valid: false, reason: 'Missing APNS_KEY_ID environment variable' };
    }
    if (!this.teamId) {
      return { valid: false, reason: 'Missing APNS_TEAM_ID environment variable' };
    }
    if (!this.privateKey) {
      return { valid: false, reason: 'Missing APNS_PRIVATE_KEY environment variable' };
    }
    if (!this.topic) {
      return { valid: false, reason: 'Missing APNS_TOPIC environment variable' };
    }
    return { valid: true };
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    const configCheck = this.validateConfiguration();
    if (!configCheck.valid) {
      return {
        success: false,
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: configCheck.reason || 'APNs provider is not properly configured with credentials',
          isTransient: false,
          isPermanentTokenInvalid: false,
        },
      };
    }

    const payload = {
      aps: {
        alert: {
          title: message.title,
          body: message.body,
        },
        sound: 'default',
      },
      teamtrack: message.payload,
    };

    try {
      let status: number;
      let data: any;
      let apnsId: string | undefined;

      if (this.customTransport) {
        const res = await this.customTransport(this.topic || 'com.teamtrack.app', message.pushToken, payload);
        status = res.status;
        data = res.data;
        apnsId = res.apnsId;
      } else {
        // Production HTTP/2 APNs call (mock/placeholder when no external network connection)
        throw new Error('Live APNs network call requires active internet and HTTP/2 connection to Apple APNs gateway');
      }

      if (status >= 200 && status < 300) {
        return {
          success: true,
          providerMessageId: apnsId || data?.apnsId || `apns-${Date.now()}`,
        };
      }

      const apnsReason = data?.reason || 'UNKNOWN_ERROR';
      return this.classifyError(apnsReason, status);
    } catch (err: any) {
      const msg = err?.message || 'Unknown network error calling APNs';
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: msg,
          isTransient: true,
          isPermanentTokenInvalid: false,
        },
      };
    }
  }

  private classifyError(reason: string, httpStatus: number): PushSendResult {
    // Check for permanent token invalidation
    if (
      reason === 'BadDeviceToken' ||
      reason === 'Unregistered' ||
      reason === 'DeviceTokenNotForTopic'
    ) {
      return {
        success: false,
        error: {
          code: reason,
          message: `Device token rejected by APNs: ${reason}`,
          isTransient: false,
          isPermanentTokenInvalid: true,
        },
      };
    }

    // Check for transient errors
    if (
      httpStatus === 429 ||
      httpStatus >= 500 ||
      reason === 'TooManyRequests' ||
      reason === 'InternalServerError' ||
      reason === 'ServiceUnavailable' ||
      reason === 'Shutdown'
    ) {
      return {
        success: false,
        error: {
          code: reason,
          message: `Transient error from APNs: ${reason}`,
          isTransient: true,
          isPermanentTokenInvalid: false,
        },
      };
    }

    // Authentication / Certificate errors (do NOT retry indefinitely)
    if (
      httpStatus === 403 ||
      reason === 'BadCertificate' ||
      reason === 'BadCertificateEnvironment' ||
      reason === 'ExpiredProviderToken' ||
      reason === 'InvalidProviderToken' ||
      reason === 'MissingProviderToken'
    ) {
      return {
        success: false,
        error: {
          code: reason,
          message: `APNs authentication/configuration failure: ${reason}`,
          isTransient: false,
          isPermanentTokenInvalid: false,
        },
      };
    }

    return {
      success: false,
      error: {
        code: reason,
        message: `APNs request rejected: ${reason}`,
        isTransient: false,
        isPermanentTokenInvalid: false,
      },
    };
  }
}
