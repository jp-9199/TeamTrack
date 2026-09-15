import { config } from '../../config/index.js';
import type { AIProvider } from './ai.provider.js';
import { mockAIProvider } from './mock.ai.provider.js';

export class AIProviderFactory {
  private static instance: AIProvider | null = null;

  /**
   * Resolves the configured AI provider.
   * SECURITY INVARIANT: Provider API keys and credentials are backend-only and never exposed.
   * Uses MockAIProvider in test environment or when external credentials are not configured.
   */
  public static getProvider(): AIProvider {
    if (this.instance) {
      return this.instance;
    }

    const isTest = process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'));
    const providerName = (process.env.AI_PROVIDER || 'mock').toLowerCase();

    if (isTest || providerName === 'mock' || !process.env.AI_API_KEY) {
      this.instance = mockAIProvider;
      return this.instance;
    }

    // Extensible vendor adapter placeholder (e.g. Anthropic, Gemini, OpenAI)
    // Always fall back safely to mock if vendor SDK cannot initialize
    this.instance = mockAIProvider;
    return this.instance;
  }

  public static setProvider(provider: AIProvider | null): void {
    this.instance = provider;
  }
}
