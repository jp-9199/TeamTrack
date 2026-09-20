import type {
  AIMessage,
  AIToolCall,
} from '@teamtrack/shared-types';
import {
  type AIProvider,
  type AIProviderOptions,
  type AIProviderChatResponse,
  type AIToolSchema,
  AIProviderError,
} from './ai.provider.js';

export class LiveCloudAIProvider implements AIProvider {
  public readonly name: string;
  private apiKey: string;
  private providerType: 'gemini' | 'openai';
  private model: string;

  constructor(providerType: 'gemini' | 'openai', apiKey: string, model?: string) {
    this.providerType = providerType;
    this.apiKey = apiKey;
    this.name = providerType === 'gemini' ? 'GoogleGeminiProvider' : 'OpenAIProvider';
    this.model = model || (providerType === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');
  }

  async generateChat(
    messages: AIMessage[],
    tools?: AIToolSchema[],
    options?: AIProviderOptions
  ): Promise<AIProviderChatResponse> {
    const modelToUse = options?.model || this.model;

    if (this.providerType === 'gemini') {
      return this.callGemini(messages, tools, modelToUse, options);
    } else {
      return this.callOpenAI(messages, tools, modelToUse, options);
    }
  }

  async generateText(prompt: string, options?: AIProviderOptions): Promise<string> {
    const res = await this.generateChat(
      [{ id: 't1', conversationId: 'c1', role: 'user', content: prompt, createdAt: new Date().toISOString() }],
      undefined,
      options
    );
    return res.message.content;
  }

  private async callGemini(
    messages: AIMessage[],
    tools?: AIToolSchema[],
    model: string = 'gemini-1.5-flash',
    options?: AIProviderOptions
  ): Promise<AIProviderChatResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.4,
            maxOutputTokens: options?.maxTokens ?? 2048,
          },
        }),
        signal: options?.abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIProviderError('GEMINI_API_ERROR', `Gemini returned ${response.status}: ${errorText}`, response.status);
      }

      const data = (await response.json()) as any;
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || 'No response generated.';

      return {
        message: {
          role: 'assistant',
          content: text,
        },
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
        },
      };
    } catch (err: any) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError('GEMINI_NETWORK_ERROR', err.message || 'Failed to communicate with Gemini API', 502);
    }
  }

  private async callOpenAI(
    messages: AIMessage[],
    tools?: AIToolSchema[],
    model: string = 'gpt-4o-mini',
    options?: AIProviderOptions
  ): Promise<AIProviderChatResponse> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          temperature: options?.temperature ?? 0.4,
          max_tokens: options?.maxTokens ?? 2048,
        }),
        signal: options?.abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIProviderError('OPENAI_API_ERROR', `OpenAI returned ${response.status}: ${errorText}`, response.status);
      }

      const data = (await response.json()) as any;
      const choice = data.choices?.[0];

      return {
        message: {
          role: 'assistant',
          content: choice?.message?.content || '',
        },
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (err: any) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError('OPENAI_NETWORK_ERROR', err.message || 'Failed to communicate with OpenAI API', 502);
    }
  }
}
