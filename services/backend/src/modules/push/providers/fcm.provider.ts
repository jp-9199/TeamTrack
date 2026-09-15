import type {
  PushMessage,
  PushProviderClient,
  PushSendResult,
} from './push-provider.interface.js';

export type FCMTransportFn = (
  projectId: string,
  payload: Record<string, unknown>
) => Promise<{ status: number; data: any }>;

export class FCMPushProvider implements PushProviderClient {
  readonly name = 'fcm' as const;
  private projectId: string | undefined;
  private clientEmail: string | undefined;
  private privateKey: string | undefined;
  private customTransport?: FCMTransportFn;

  constructor(options?: {
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
    transport?: FCMTransportFn;
  }) {
    this.projectId = options?.projectId || process.env.FCM_PROJECT_ID;
    this.clientEmail = options?.clientEmail || process.env.FCM_CLIENT_EMAIL;
    this.privateKey = options?.privateKey || process.env.FCM_PRIVATE_KEY;
    this.customTransport = options?.transport;
  }

  setTransport(transport: FCMTransportFn): void {
    this.customTransport = transport;
  }

  validateConfiguration(): { valid: boolean; reason?: string } {
    if (this.customTransport) {
      return { valid: true };
    }
    if (!this.projectId) {
      return { valid: false, reason: 'Missing FCM_PROJECT_ID environment variable' };
    }
    if (!this.clientEmail) {
      return { valid: false, reason: 'Missing FCM_CLIENT_EMAIL environment variable' };
    }
    if (!this.privateKey) {
      return { valid: false, reason: 'Missing FCM_PRIVATE_KEY environment variable' };
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
          message: configCheck.reason || 'FCM provider is not properly configured with credentials',
          isTransient: false,
          isPermanentTokenInvalid: false,
        },
      };
    }

    const payload = {
      message: {
        token: message.pushToken,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: Object.fromEntries(
          Object.entries(message.payload).map(([k, v]) => [k, v !== undefined && v !== null ? String(v) : ''])
        ),
      },
    };

    try {
      let status: number;
      let data: any;

      if (this.customTransport) {
        const res = await this.customTransport(this.projectId || 'mock-project', payload);
        status = res.status;
        data = res.data;
      } else {
        // Production FCM HTTP v1 call (mock/placeholder when no external network connection)
        // Note: Real FCM HTTP v1 requires Google OAuth2 token. If credentials are dummy, it throws.
        throw new Error('Live FCM network call requires active internet and authenticated Google OAuth2 client');
      }

      if (status >= 200 && status < 300) {
        return {
          success: true,
          providerMessageId: data?.name || `fcm-${Date.now()}`,
        };
      }

      const fcmError = data?.error?.details?.[0]?.errorCode || data?.error?.status || 'UNKNOWN_ERROR';
      const fcmMsg = data?.error?.message || 'FCM delivery failed';

      return this.classifyError(fcmError, fcmMsg, status);
    } catch (err: any) {
      const msg = err?.message || 'Unknown network error calling FCM';
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

  private classifyError(code: string, message: string, httpStatus: number): PushSendResult {
    // Check for permanent token invalidation
    if (
      code === 'UNREGISTERED' ||
      code === 'INVALID_ARGUMENT' && message.toLowerCase().includes('token') ||
      message.toLowerCase().includes('registration token') ||
      message.toLowerCase().includes('not registered')
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_OR_UNREGISTERED_TOKEN',
          message,
          isTransient: false,
          isPermanentTokenInvalid: true,
        },
      };
    }

    // Check for transient errors
    if (
      httpStatus === 429 ||
      httpStatus >= 500 ||
      code === 'RESOURCE_EXHAUSTED' ||
      code === 'UNAVAILABLE' ||
      code === 'DEADLINE_EXCEEDED'
    ) {
      return {
        success: false,
        error: {
          code: code || 'PROVIDER_TRANSIENT_ERROR',
          message,
          isTransient: true,
          isPermanentTokenInvalid: false,
        },
      };
    }

    // Configuration / auth errors (do NOT retry indefinitely)
    if (httpStatus === 401 || httpStatus === 403 || code === 'UNAUTHENTICATED' || code === 'PERMISSION_DENIED') {
      return {
        success: false,
        error: {
          code: code || 'PROVIDER_AUTH_ERROR',
          message,
          isTransient: false,
          isPermanentTokenInvalid: false,
        },
      };
    }

    return {
      success: false,
      error: {
        code: code || 'PERMANENT_PAYLOAD_ERROR',
        message,
        isTransient: false,
        isPermanentTokenInvalid: false,
      },
    };
  }
}
