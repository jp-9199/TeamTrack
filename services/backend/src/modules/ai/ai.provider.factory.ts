import { config } from '../../config/index.js';
import type { AIProvider } from './ai.provider.js';
import { mockAIProvider } from './mock.ai.provider.js';
import { LiveCloudAIProvider } from './llm.provider.js';

export class AIProviderFactory {
  private static instance: AIProvider | null = null;

  /**
   * Resolves the configured AI provider.
   * SECURITY INVARIANT: Provider API keys and credentials are backend-only and never exposed.
   * Uses IntelligentEnterpriseAIProvider in test environment or when external credentials are not configured.
   * Automatically initializes Google Gemini or OpenAI provider if corresponding environment keys are present.
   */
  public static getProvider(): AIProvider {
    if (this.instance) {
      return this.instance;
    }

    const isTest = process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'));
    const providerName = (process.env.AI_PROVIDER || '').toLowerCase();
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const genericKey = process.env.AI_API_KEY;

    if (isTest) {
      this.instance = mockAIProvider;
      return this.instance;
    }

    // Google Gemini configuration
    if (geminiKey || (providerName === 'gemini' && genericKey)) {
      const key = geminiKey || genericKey!;
      this.instance = new LiveCloudAIProvider('gemini', key, process.env.AI_MODEL || 'gemini-1.5-flash');
      return this.instance;
    }

    // OpenAI configuration
    if (openaiKey || (providerName === 'openai' && genericKey)) {
      const key = openaiKey || genericKey!;
      this.instance = new LiveCloudAIProvider('openai', key, process.env.AI_MODEL || 'gpt-4o-mini');
      return this.instance;
    }

    // Default to the intelligent local enterprise provider
    this.instance = mockAIProvider;
    return this.instance;
  }

  public static setProvider(provider: AIProvider | null): void {
    this.instance = provider;
  }
}
