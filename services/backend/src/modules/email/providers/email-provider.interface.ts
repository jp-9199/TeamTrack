export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface EmailProviderError {
  code: string;
  message: string;
  isTransient: boolean;
  isPermanentAddressInvalid?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  providerMessageId?: string;
  error?: EmailProviderError;
}

export interface EmailProvider {
  readonly name: string;
  send(params: SendEmailParams): Promise<SendEmailResult>;
  validateConfiguration(): { isValid: boolean; error?: string };
}
