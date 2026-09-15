import type {
  PushProvider,
  PushNotificationPayload,
} from '@teamtrack/shared-types';

export interface PushMessage {
  pushToken: string;
  title: string;
  body: string;
  payload: PushNotificationPayload;
}

export interface PushProviderError {
  code: string;
  message: string;
  isTransient: boolean;
  isPermanentTokenInvalid: boolean;
}

export interface PushSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: PushProviderError;
}

export interface PushProviderClient {
  readonly name: PushProvider;
  send(message: PushMessage): Promise<PushSendResult>;
  validateConfiguration(): { valid: boolean; reason?: string };
}
