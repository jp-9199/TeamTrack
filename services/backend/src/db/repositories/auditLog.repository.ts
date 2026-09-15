import { pool } from '../pool.js';

export interface CreateAuditLogEntry {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DbAuditLog {
  id: string;
  organization_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface AuditLogFilters {
  cursor?: string;
  limit?: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedAuditLogs {
  items: Array<{
    id: string;
    organizationId: string | null;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export class AuditLogRepository {
  /**
   * Appends an immutable audit event to the audit_logs table.
   * Redacts sensitive secret fields (passwords, tokens, keys) before persistence.
   */
  async logAudit(entry: CreateAuditLogEntry, db: any = pool): Promise<void> {
    const sanitizedMetadata = this.sanitizeMetadata(entry.metadata || {});

    const query = `
      INSERT INTO audit_logs (
        organization_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        ip_address,
        user_agent,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `;

    try {
      await db.query(query, [
        entry.organizationId || null,
        entry.actorId || null,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.ipAddress || null,
        entry.userAgent || null,
        JSON.stringify(sanitizedMetadata),
      ]);
    } catch (err: any) {
      console.error('[AuditLogRepository] Failed to write audit event:', err.message);
    }
  }

  /**
   * Queries audit logs for a specific organization with parameterized filters and keyset cursor pagination.
   * Strictly enforces tenant isolation at query construction time.
   */
  async queryAuditLogs(
    orgId: string,
    filters: AuditLogFilters,
    db: any = pool
  ): Promise<PaginatedAuditLogs> {
    const limit = Math.min(Math.max(filters.limit || 50, 1), 100);
    const conditions: string[] = ['organization_id = $1'];
    const values: any[] = [orgId];
    let paramIdx = 2;

    if (filters.action) {
      conditions.push(`action = $${paramIdx++}`);
      values.push(filters.action);
    }

    if (filters.actorId) {
      conditions.push(`actor_id = $${paramIdx++}`);
      values.push(filters.actorId);
    }

    if (filters.entityType) {
      conditions.push(`entity_type = $${paramIdx++}`);
      values.push(filters.entityType);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIdx++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIdx++}`);
      values.push(filters.endDate);
    }

    if (filters.cursor) {
      try {
        const decoded = Buffer.from(filters.cursor, 'base64').toString('utf8');
        const [cursorTime, cursorId] = decoded.split('_');
        if (cursorTime && cursorId) {
          conditions.push(`(created_at, id) < ($${paramIdx++}, $${paramIdx++})`);
          values.push(new Date(cursorTime), cursorId);
        }
      } catch {
        // Invalid cursor decoded safely ignored or yields empty result
      }
    }

    const queryText = `
      SELECT id, organization_id, actor_id, action, entity_type, entity_id,
             ip_address, user_agent, metadata, created_at
      FROM audit_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT $${paramIdx}
    `;
    values.push(limit + 1);

    const res = await db.query(queryText, values);
    const rows: DbAuditLog[] = res.rows;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      const cursorPayload = `${lastItem.created_at.toISOString()}_${lastItem.id}`;
      nextCursor = Buffer.from(cursorPayload).toString('base64');
    }

    return {
      items: items.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        actorId: row.actor_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        metadata: this.sanitizeMetadata(row.metadata || {}),
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  private sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    const sensitiveKeys = ['token', 'password', 'secret', 'key', 'credential', 'auth', 'hash'];

    for (const [key, value] of Object.entries(meta)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
        clean[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        clean[key] = this.sanitizeMetadata(value as Record<string, unknown>);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }
}

export const auditLogRepository = new AuditLogRepository();

