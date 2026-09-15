import type { EmailProvider } from './email-provider.interface.js';
import { SMTPEmailProvider } from './smtp.provider.js';

export class EmailProviderRegistry {
  private providers = new Map<string, EmailProvider>();
  private defaultProviderName: string = 'smtp';

  constructor() {
    // Register default SMTP provider
    this.register(new SMTPEmailProvider());
  }

  register(provider: EmailProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  getProvider(name?: string): EmailProvider | undefined {
    if (!name) {
      return this.providers.get(this.defaultProviderName);
    }
    return this.providers.get(name.toLowerCase());
  }

  setDefaultProvider(name: string): void {
    this.defaultProviderName = name.toLowerCase();
  }

  hasValidProvider(): boolean {
    const p = this.getProvider();
    if (!p) return false;
    return p.validateConfiguration().isValid;
  }
}

export const emailProviderRegistry = new EmailProviderRegistry();
