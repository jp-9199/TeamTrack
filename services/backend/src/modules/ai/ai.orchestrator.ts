import * as crypto from 'crypto';
import type {
  AIMessage,
  AIToolCall,
  AIToolResult,
  AIActionProposal,
} from '@teamtrack/shared-types';
import { AIProviderFactory } from './ai.provider.factory.js';
import { AIToolRegistry } from './ai.tool.registry.js';
import type { AIToolContext } from './ai.tool.types.js';
import { AIPolicy } from './ai.policy.js';
import { SYSTEM_PROMPT } from './ai.prompts.js';
import { aiConversationRepository } from '../../db/repositories/aiConversation.repository.js';
import { auditLogRepository } from '../../db/repositories/auditLog.repository.js';

export interface OrchestrationResult {
  assistantMessage: {
    content: string;
    toolCalls?: AIToolCall[];
  };
  actionProposal?: AIActionProposal;
  toolResults: AIToolResult[];
  executionTimeMs: number;
}

export class AIOrchestrator {
  /**
   * Runs the model interaction loop with strict security boundaries:
   * 1. System prompt separation
   * 2. Allowlisted tools only
   * 3. Max turns (3) and max tool calls (5)
   * 4. Confirmation requirement for protected write tools
   * 5. Sanitization of tool outputs as untrusted data
   */
  async runLoop(
    conversationId: string,
    history: AIMessage[],
    context: AIToolContext
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const provider = AIProviderFactory.getProvider();
    const toolSchemas = AIToolRegistry.getSchemas();

    let totalToolCallsExecuted = 0;
    let turnCount = 0;
    let activeActionProposal: AIActionProposal | undefined;
    const accumulatedToolResults: AIToolResult[] = [];

    // Construct message stack starting with immutable system prompt
    const messages: AIMessage[] = [
      {
        id: 'system-prompt',
        conversationId,
        role: 'system',
        content: SYSTEM_PROMPT,
        createdAt: new Date().toISOString(),
      },
      ...history,
    ];

    let lastAssistantContent = '';
    let lastToolCalls: AIToolCall[] | undefined;

    while (turnCount < AIPolicy.MAX_TURNS_PER_REQUEST) {
      turnCount++;

      // 1. Call model provider
      const response = await provider.generateChat(messages, toolSchemas, {
        timeoutMs: 15000,
      });

      lastAssistantContent = response.message.content || '';
      lastToolCalls = response.message.toolCalls;

      // If no tool calls, conversation turn is complete
      if (!response.message.toolCalls || response.message.toolCalls.length === 0) {
        break;
      }

      if (turnCount >= AIPolicy.MAX_TURNS_PER_REQUEST) {
        throw new Error('AI_TOOL_LIMIT_EXCEEDED: Maximum model turns reached with unresolved tool calls');
      }

      // Add assistant response to history before tool results
      messages.push({
        id: `assistant-turn-${turnCount}`,
        conversationId,
        role: 'assistant',
        content: lastAssistantContent,
        toolCalls: lastToolCalls,
        createdAt: new Date().toISOString(),
      });

      // 2. Process tool calls
      let proposalCreatedInThisTurn = false;

      for (const call of response.message.toolCalls) {
        if (totalToolCallsExecuted >= AIPolicy.MAX_TOOL_CALLS_PER_REQUEST) {
          throw new Error('AI_TOOL_LIMIT_EXCEEDED: Maximum tool executions exceeded for this request');
        }
        totalToolCallsExecuted++;

        const tool = AIToolRegistry.get(call.name);

        // Security check: Reject unknown tool immediately
        if (!tool) {
          await auditLogRepository.logAudit({
            organizationId: context.organizationId,
            actorId: context.callerId,
            action: 'AI_TOOL_DENIED',
            entityType: 'ai_tool',
            entityId: conversationId,
            metadata: { toolName: call.name, reason: 'Tool not in allowlist' },
          });

          accumulatedToolResults.push({
            toolCallId: call.id,
            name: call.name,
            result: null,
            error: `Tool "${call.name}" is not recognized or not allowed.`,
          });

          messages.push({
            id: `tool-${call.id}`,
            conversationId,
            role: 'tool',
            content: `Error: Tool "${call.name}" is not recognized or allowed.`,
            createdAt: new Date().toISOString(),
          });
          continue;
        }

        // Validate arguments
        try {
          if (tool.validateArgs) {
            tool.validateArgs(call.arguments);
          }
        } catch (argErr: any) {
          accumulatedToolResults.push({
            toolCallId: call.id,
            name: call.name,
            result: null,
            error: `Invalid tool arguments: ${argErr.message}`,
          });

          messages.push({
            id: `tool-${call.id}`,
            conversationId,
            role: 'tool',
            content: `Error: Invalid tool arguments: ${argErr.message}`,
            createdAt: new Date().toISOString(),
          });
          continue;
        }

        // Check if write tool requires user confirmation
        if (tool.requiresConfirmation) {
          // Verify authorization ahead of time if authorizer defined
          if (tool.authorize) {
            try {
              await tool.authorize(call.arguments, context);
            } catch (authErr: any) {
              await auditLogRepository.logAudit({
                organizationId: context.organizationId,
                actorId: context.callerId,
                action: 'AI_TOOL_DENIED',
                entityType: 'ai_tool',
                entityId: conversationId,
                metadata: { toolName: call.name, error: authErr.message },
              });
              throw authErr;
            }
          }

          // Generate high-entropy confirmation token and store ONLY SHA-256 hash
          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const expiresAt = new Date(Date.now() + AIPolicy.CONFIRMATION_EXPIRATION_MINUTES * 60 * 1000);

          const proposal = await aiConversationRepository.createActionProposal(
            {
              conversationId,
              userId: context.callerId,
              organizationId: context.organizationId || null,
              toolName: tool.name,
              toolArguments: call.arguments,
              confirmationTokenHash: tokenHash,
              expiresAt,
            },
            rawToken
          );

          activeActionProposal = proposal;
          proposalCreatedInThisTurn = true;

          await auditLogRepository.logAudit({
            organizationId: context.organizationId,
            actorId: context.callerId,
            action: 'AI_WRITE_PROPOSED',
            entityType: 'ai_action_proposal',
            entityId: proposal.id,
            metadata: { toolName: tool.name, proposalId: proposal.id },
          });

          // Break loop on confirmation requirement
          break;
        }

        // Execute read or low-risk tool
        try {
          if (tool.authorize) {
            await tool.authorize(call.arguments, context);
          }

          const rawResult = await tool.execute(call.arguments, context);
          const sanitizedResult = AIPolicy.sanitizeToolOutput(rawResult);
          const encapsulated = AIPolicy.encapsulateUntrustedData(tool.name, sanitizedResult);

          accumulatedToolResults.push({
            toolCallId: call.id,
            name: tool.name,
            result: sanitizedResult,
          });

          messages.push({
            id: `tool-${call.id}`,
            conversationId,
            role: 'tool',
            content: encapsulated,
            createdAt: new Date().toISOString(),
          });

          await auditLogRepository.logAudit({
            organizationId: context.organizationId,
            actorId: context.callerId,
            action: 'AI_TOOL_INVOKED',
            entityType: 'ai_tool',
            entityId: conversationId,
            metadata: { toolName: tool.name },
          });
        } catch (execErr: any) {
          accumulatedToolResults.push({
            toolCallId: call.id,
            name: tool.name,
            result: null,
            error: execErr.message,
          });

          messages.push({
            id: `tool-${call.id}`,
            conversationId,
            role: 'tool',
            content: `Tool error: ${execErr.message}`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (proposalCreatedInThisTurn) {
        break;
      }
    }

    return {
      assistantMessage: {
        content: lastAssistantContent,
        toolCalls: lastToolCalls,
      },
      actionProposal: activeActionProposal,
      toolResults: accumulatedToolResults,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export const aiOrchestrator = new AIOrchestrator();
