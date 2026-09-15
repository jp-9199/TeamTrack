import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';

export type Queryable = Pool | PoolClient;
import type {
  AIConversation,
  AIMessage,
  AIActionProposal,
  AIActionStatus,
  AIMessageRole,
} from '@teamtrack/shared-types';

export interface DbAIConversation {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  created_at: Date;
  updated_at: Date;
}

export interface DbAIMessage {
  id: string;
  conversation_id: string;
  role: AIMessageRole;
  content: string;
  tool_calls: any;
  tool_results: any;
  created_at: Date;
}

export interface DbAIActionProposal {
  id: string;
  conversation_id: string;
  user_id: string;
  organization_id: string | null;
  tool_name: string;
  tool_arguments: Record<string, unknown>;
  status: AIActionStatus;
  confirmation_token_hash: string;
  expires_at: Date;
  execution_result: any;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export class AIConversationRepository {
  private mapConversation(row: DbAIConversation): AIConversation {
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      title: row.title,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapMessage(row: DbAIMessage): AIMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      toolCalls: row.tool_calls || undefined,
      toolResults: row.tool_results || undefined,
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapProposal(row: DbAIActionProposal, confirmationToken?: string): AIActionProposal {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      organizationId: row.organization_id,
      toolName: row.tool_name,
      toolArguments: row.tool_arguments,
      status: row.status,
      summary: `Action proposal for ${row.tool_name}`,
      confirmationToken, // Exposed only on creation, never stored as plaintext
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --- Conversations ---

  async createConversation(
    userId: string,
    organizationId: string | null,
    title: string = 'New Conversation',
    db: Queryable = pool
  ): Promise<AIConversation> {
    const query = `
      INSERT INTO ai_conversations (user_id, organization_id, title)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await db.query<DbAIConversation>(query, [userId, organizationId, title]);
    return this.mapConversation(res.rows[0]);
  }

  async getConversation(
    conversationId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<AIConversation | null> {
    const query = `
      SELECT * FROM ai_conversations
      WHERE id = $1 AND user_id = $2;
    `;
    const res = await db.query<DbAIConversation>(query, [conversationId, userId]);
    if (!res.rows[0]) return null;
    return this.mapConversation(res.rows[0]);
  }

  async listConversations(
    userId: string,
    organizationId?: string | null,
    limit: number = 50,
    db: Queryable = pool
  ): Promise<AIConversation[]> {
    let query = `
      SELECT * FROM ai_conversations
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (organizationId !== undefined) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }

    query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1};`;
    params.push(limit);

    const res = await db.query<DbAIConversation>(query, params);
    return res.rows.map((r: DbAIConversation) => this.mapConversation(r));
  }

  async touchConversation(
    conversationId: string,
    db: Queryable = pool
  ): Promise<void> {
    await db.query(`UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1;`, [conversationId]);
  }

  async deleteConversation(
    conversationId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<boolean> {
    const query = `
      DELETE FROM ai_conversations
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;
    const res = await db.query(query, [conversationId, userId]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Messages ---

  async createMessage(
    conversationId: string,
    role: AIMessageRole,
    content: string,
    toolCalls?: any,
    toolResults?: any,
    db: Queryable = pool
  ): Promise<AIMessage> {
    const query = `
      INSERT INTO ai_messages (
        conversation_id,
        role,
        content,
        tool_calls,
        tool_results
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const res = await db.query<DbAIMessage>(query, [
      conversationId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      toolResults ? JSON.stringify(toolResults) : null,
    ]);

    await this.touchConversation(conversationId, db);
    return this.mapMessage(res.rows[0]);
  }

  async listMessages(
    conversationId: string,
    limit: number = 100,
    db: Queryable = pool
  ): Promise<AIMessage[]> {
    const query = `
      SELECT * FROM ai_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT $2;
    `;
    const res = await db.query<DbAIMessage>(query, [conversationId, limit]);
    return res.rows.map((r: DbAIMessage) => this.mapMessage(r));
  }

  // --- Action Proposals ---

  async createActionProposal(
    data: {
      conversationId: string;
      userId: string;
      organizationId: string | null;
      toolName: string;
      toolArguments: Record<string, unknown>;
      confirmationTokenHash: string;
      expiresAt: Date;
    },
    rawConfirmationToken: string,
    db: Queryable = pool
  ): Promise<AIActionProposal> {
    const query = `
      INSERT INTO ai_action_proposals (
        conversation_id,
        user_id,
        organization_id,
        tool_name,
        tool_arguments,
        status,
        confirmation_token_hash,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, 'PROPOSED', $6, $7)
      RETURNING *;
    `;
    const res = await db.query<DbAIActionProposal>(query, [
      data.conversationId,
      data.userId,
      data.organizationId,
      data.toolName,
      JSON.stringify(data.toolArguments),
      data.confirmationTokenHash,
      data.expiresAt,
    ]);

    return this.mapProposal(res.rows[0], rawConfirmationToken);
  }

  async getActionProposal(
    actionId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<AIActionProposal | null> {
    const query = `
      SELECT * FROM ai_action_proposals
      WHERE id = $1 AND user_id = $2;
    `;
    const res = await db.query<DbAIActionProposal>(query, [actionId, userId]);
    if (!res.rows[0]) return null;
    return this.mapProposal(res.rows[0]);
  }

  /**
   * Atomically claims a proposal for execution.
   * Enforces:
   * 1. Ownership (user_id = $2)
   * 2. Valid token hash (confirmation_token_hash = $3)
   * 3. Current state must be 'PROPOSED'
   * 4. Expiration check (expires_at > NOW())
   * Transitions atomically to 'CONFIRMED'.
   * Prevents race conditions and double-executions.
   */
  async claimActionProposalForExecution(
    actionId: string,
    userId: string,
    tokenHash: string,
    db: Queryable = pool
  ): Promise<AIActionProposal | null> {
    const query = `
      UPDATE ai_action_proposals
      SET status = 'CONFIRMED',
          updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND confirmation_token_hash = $3
        AND status = 'PROPOSED'
        AND expires_at > NOW()
      RETURNING *;
    `;
    const res = await db.query<DbAIActionProposal>(query, [actionId, userId, tokenHash]);
    if (!res.rows[0]) return null;
    return this.mapProposal(res.rows[0]);
  }

  async completeActionExecution(
    actionId: string,
    executionResult: unknown,
    db: Queryable = pool
  ): Promise<AIActionProposal | null> {
    const query = `
      UPDATE ai_action_proposals
      SET status = 'EXECUTED',
          execution_result = $2,
          updated_at = NOW()
      WHERE id = $1 AND status = 'CONFIRMED'
      RETURNING *;
    `;
    const res = await db.query<DbAIActionProposal>(query, [
      actionId,
      JSON.stringify(executionResult),
    ]);
    if (!res.rows[0]) return null;
    return this.mapProposal(res.rows[0]);
  }

  async failActionExecution(
    actionId: string,
    errorMessage: string,
    db: Queryable = pool
  ): Promise<AIActionProposal | null> {
    const query = `
      UPDATE ai_action_proposals
      SET status = 'FAILED',
          error_message = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await db.query<DbAIActionProposal>(query, [actionId, errorMessage]);
    if (!res.rows[0]) return null;
    return this.mapProposal(res.rows[0]);
  }

  async cancelActionProposal(
    actionId: string,
    userId: string,
    db: Queryable = pool
  ): Promise<AIActionProposal | null> {
    const query = `
      UPDATE ai_action_proposals
      SET status = 'CANCELLED',
          updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND status = 'PROPOSED'
        AND expires_at > NOW()
      RETURNING *;
    `;
    const res = await db.query<DbAIActionProposal>(query, [actionId, userId]);
    if (!res.rows[0]) return null;
    return this.mapProposal(res.rows[0]);
  }
}

export const aiConversationRepository = new AIConversationRepository();
