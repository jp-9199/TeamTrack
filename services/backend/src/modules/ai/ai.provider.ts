import type {
  AIMessage,
  AIToolCall,
} from '@teamtrack/shared-types';

export interface AIProviderOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface AIProviderChatResponse {
  message: {
    role: 'assistant';
    content: string;
    toolCalls?: AIToolCall[];
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class AIProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 502,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export interface AIProvider {
  readonly name: string;

  /**
   * Generates a conversational chat turn with optional tool selection.
   */
  generateChat(
    messages: AIMessage[],
    tools?: AIToolSchema[],
    options?: AIProviderOptions
  ): Promise<AIProviderChatResponse>;

  /**
   * Generates a raw text completion.
   */
  generateText(
    prompt: string,
    options?: AIProviderOptions
  ): Promise<string>;
}
