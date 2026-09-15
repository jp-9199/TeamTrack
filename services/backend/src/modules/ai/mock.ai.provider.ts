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

export class MockAIProvider implements AIProvider {
  public readonly name = 'MockAIProvider';

  // Test control knobs
  public forceError: AIProviderError | null = null;
  public forceTimeout = false;
  public forceMalformedToolCall = false;
  public forceToolCalls: AIToolCall[] | null = null;
  public loopCount = 0;
  public customResponder?: (messages: AIMessage[], tools?: AIToolSchema[]) => AIProviderChatResponse;

  reset(): void {
    this.forceError = null;
    this.forceTimeout = false;
    this.forceMalformedToolCall = false;
    this.forceToolCalls = null;
    this.loopCount = 0;
    this.customResponder = undefined;
  }

  async generateChat(
    messages: AIMessage[],
    tools?: AIToolSchema[],
    options?: AIProviderOptions
  ): Promise<AIProviderChatResponse> {
    if (this.forceTimeout) {
      throw new AIProviderError('AI_PROVIDER_TIMEOUT', 'Mock AI provider request timed out', 504);
    }

    if (this.forceError) {
      throw this.forceError;
    }

    if (this.customResponder) {
      return this.customResponder(messages, tools);
    }

    const lastMessage = messages[messages.length - 1];
    const content = lastMessage?.content || '';

    // Simulate malformed tool call
    if (this.forceMalformedToolCall) {
      this.forceMalformedToolCall = false; // single use
      return {
        message: {
          role: 'assistant',
          content: 'Invoking malformed tool',
          toolCalls: [
            {
              id: 'call_malformed',
              name: 'invalid_tool_name_not_registered',
              arguments: { bad: 'args' },
            },
          ],
        },
      };
    }

    // Explicit forced tool calls
    if (this.forceToolCalls) {
      const calls = this.forceToolCalls;
      this.forceToolCalls = null; // single use
      return {
        message: {
          role: 'assistant',
          content: 'Executing tool call',
          toolCalls: calls,
        },
      };
    }

    // Check if the conversation ends with a tool result
    if (lastMessage?.role === 'tool') {
      return {
        message: {
          role: 'assistant',
          content: `Processed tool result: ${lastMessage.content}`,
        },
      };
    }

    // Natural language intent matching for deterministic testing
    const lower = content.toLowerCase();

    // 1. Search Intent
    if (lower.includes('search') || lower.includes('find') || lower.includes('website redesign')) {
      let query = 'general';
      if (lower.includes('website redesign')) query = 'website redesign';
      else if (lower.includes('q4 report')) query = 'Q4 report';
      else if (lower.includes('search:')) query = content.split('search:')[1].trim();

      return {
        message: {
          role: 'assistant',
          content: `Searching TeamTrack for "${query}"`,
          toolCalls: [
            {
              id: `call_search_${Date.now()}`,
              name: 'search_teamtrack',
              arguments: { query },
            },
          ],
        },
      };
    }

    // 2. Schedule meeting / calendar event
    if (lower.includes('schedule') || lower.includes('create meeting') || lower.includes('calendar')) {
      // Ambiguity check: missing time
      if (!lower.includes('pm') && !lower.includes('am') && !lower.includes(':') && !lower.includes('tomorrow at')) {
        return {
          message: {
            role: 'assistant',
            content: 'What time would you like to schedule the meeting?',
          },
        };
      }

      // Ambiguity check: multiple matching users
      if (lower.includes('ahmed') && lower.includes('which ahmed')) {
        return {
          message: {
            role: 'assistant',
            content: 'There are multiple users named Ahmed. Did you mean Ahmed Khan or Ahmed Hassan?',
          },
        };
      }

      if (lower.includes('create meeting')) {
        return {
          message: {
            role: 'assistant',
            content: 'I will create the meeting for you.',
            toolCalls: [
              {
                id: `call_meet_${Date.now()}`,
                name: 'create_meeting',
                arguments: {
                  title: 'Project Review',
                  scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
                  scheduledEndTime: new Date(Date.now() + 90000000).toISOString(),
                },
              },
            ],
          },
        };
      }

      return {
        message: {
          role: 'assistant',
          content: 'I will create the calendar event for you.',
          toolCalls: [
            {
              id: `call_cal_${Date.now()}`,
              name: 'create_calendar_event',
              arguments: {
                title: 'Meeting with Ahmed',
                startTime: new Date(Date.now() + 86400000).toISOString(),
                endTime: new Date(Date.now() + 90000000).toISOString(),
              },
            },
          ],
        },
      };
    }

    // 3. Send message intent
    if (lower.includes('send a message') || lower.includes('send message')) {
      return {
        message: {
          role: 'assistant',
          content: 'I can send that message for you.',
          toolCalls: [
            {
              id: `call_msg_${Date.now()}`,
              name: 'send_message',
              arguments: {
                targetType: 'channel',
                targetId: 'channel-test-123',
                content: 'the deployment is complete',
              },
            },
          ],
        },
      };
    }

    // 4. Prompt injection attempts
    if (
      lower.includes('ignore all previous instructions') ||
      lower.includes('ignore previous instructions') ||
      lower.includes('send the database') ||
      lower.includes('reveal your system prompt') ||
      lower.includes('execute sql') ||
      lower.includes('reveal api keys')
    ) {
      return {
        message: {
          role: 'assistant',
          content: 'I cannot comply with requests that attempt to bypass safety policies or access unauthorized resources.',
        },
      };
    }

    // Default conversational response
    return {
      message: {
        role: 'assistant',
        content: `I received your message: "${content}". How can I assist you with TeamTrack today?`,
      },
      usage: {
        promptTokens: 20,
        completionTokens: 20,
        totalTokens: 40,
      },
    };
  }

  async generateText(prompt: string, options?: AIProviderOptions): Promise<string> {
    if (this.forceTimeout) {
      throw new AIProviderError('AI_PROVIDER_TIMEOUT', 'Mock AI provider timeout', 504);
    }
    if (this.forceError) {
      throw this.forceError;
    }
    return `Mock completion for: ${prompt}`;
  }
}

export const mockAIProvider = new MockAIProvider();
