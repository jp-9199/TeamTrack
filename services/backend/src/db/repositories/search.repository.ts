import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  SearchResultItem,
  SearchResultType,
  SearchCategoryFilter,
  SearchCursorData,
} from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface RawSearchRow {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  created_at: Date;
  organization_id: string | null;
  relevance: number;
  metadata: Record<string, unknown>;
}

export class SearchRepository {
  /**
   * Searches across authorized users in the caller's active organizations.
   */
  async searchUsers(
    query: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData,
    db: Queryable = pool
  ): Promise<SearchResultItem[]> {
    if (orgIds.length === 0) return [];

    let cursorClause = '';
    const params: unknown[] = [query, callerId, orgIds, limit];

    if (cursor) {
      params.push(cursor.relevance, cursor.createdAt, cursor.id);
      cursorClause = `
        AND (
          relevance < $5 OR
          (relevance = $5 AND (u.created_at < $6 OR (u.created_at = $6 AND u.id < $7)))
        )
      `;
    }

    const sql = `
      WITH scored_users AS (
        SELECT DISTINCT
          u.id,
          'user'::text AS type,
          u.display_name AS title,
          u.full_name AS subtitle,
          NULL::text AS snippet,
          u.created_at,
          om.organization_id,
          (
            CASE 
              WHEN LOWER(u.display_name) = LOWER($1) OR LOWER(COALESCE(u.full_name, '')) = LOWER($1) THEN 100
              WHEN LOWER(u.display_name) LIKE LOWER($1) || '%' OR LOWER(COALESCE(u.full_name, '')) LIKE LOWER($1) || '%' THEN 75
              WHEN LOWER(u.display_name) LIKE '%' || LOWER($1) || '%' OR LOWER(COALESCE(u.full_name, '')) LIKE '%' || LOWER($1) || '%' THEN 50
              ELSE 25
            END
          )::float AS relevance,
          json_build_object(
            'avatarUrl', u.avatar_url,
            'email', CASE WHEN om.role IN ('owner', 'admin') OR u.id = $2 THEN u.email ELSE NULL END
          ) AS metadata
        FROM users u
        JOIN organization_members om ON om.user_id = u.id
        WHERE om.organization_id = ANY($3::uuid[])
          AND om.status = 'active'
          AND u.deleted_at IS NULL
          AND u.status = 'active'
          AND (
            u.display_name ILIKE '%' || $1 || '%' OR
            u.full_name ILIKE '%' || $1 || '%' OR
            (u.email ILIKE '%' || $1 || '%' AND (om.role IN ('owner', 'admin') OR u.id = $2))
          )
      )
      SELECT * FROM scored_users u
      WHERE 1=1 ${cursorClause}
      ORDER BY relevance DESC, created_at DESC, id DESC
      LIMIT $4
    `;

    const res = await db.query<RawSearchRow>(sql, params);
    return res.rows.map(this.mapRow);
  }

  /**
   * Searches teams accessible to the caller.
   */
  async searchTeams(
    query: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData,
    db: Queryable = pool
  ): Promise<SearchResultItem[]> {
    if (orgIds.length === 0) return [];

    let cursorClause = '';
    const params: unknown[] = [query, callerId, orgIds, limit];

    if (cursor) {
      params.push(cursor.relevance, cursor.createdAt, cursor.id);
      cursorClause = `
        AND (
          relevance < $5 OR
          (relevance = $5 AND (t.created_at < $6 OR (t.created_at = $6 AND t.id < $7)))
        )
      `;
    }

    const sql = `
      WITH scored_teams AS (
        SELECT 
          t.id,
          'team'::text AS type,
          t.name AS title,
          t.description AS subtitle,
          NULL::text AS snippet,
          t.created_at,
          t.organization_id,
          (
            CASE 
              WHEN LOWER(t.name) = LOWER($1) THEN 100
              WHEN LOWER(t.name) LIKE LOWER($1) || '%' THEN 75
              ELSE 50
            END
          )::float AS relevance,
          json_build_object('isPrivate', t.is_private, 'slug', t.slug) AS metadata
        FROM teams t
        JOIN organization_members om ON om.organization_id = t.organization_id AND om.user_id = $2 AND om.status = 'active'
        LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
        WHERE t.organization_id = ANY($3::uuid[])
          AND t.deleted_at IS NULL
          AND (
            (t.is_private = false AND om.role != 'guest') OR
            tm.user_id IS NOT NULL OR
            om.role IN ('owner', 'admin')
          )
          AND (
            t.name ILIKE '%' || $1 || '%' OR
            t.description ILIKE '%' || $1 || '%'
          )
      )
      SELECT * FROM scored_teams t
      WHERE 1=1 ${cursorClause}
      ORDER BY relevance DESC, created_at DESC, id DESC
      LIMIT $4
    `;

    const res = await db.query<RawSearchRow>(sql, params);
    return res.rows.map(this.mapRow);
  }

  /**
   * Searches channels accessible to the caller.
   */
  async searchChannels(
    query: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData,
    db: Queryable = pool
  ): Promise<SearchResultItem[]> {
    if (orgIds.length === 0) return [];

    let cursorClause = '';
    const params: unknown[] = [query, callerId, orgIds, limit];

    if (cursor) {
      params.push(cursor.relevance, cursor.createdAt, cursor.id);
      cursorClause = `
        AND (
          relevance < $5 OR
          (relevance = $5 AND (c.created_at < $6 OR (c.created_at = $6 AND c.id < $7)))
        )
      `;
    }

    const sql = `
      WITH scored_channels AS (
        SELECT 
          c.id,
          'channel'::text AS type,
          c.name AS title,
          c.description AS subtitle,
          NULL::text AS snippet,
          c.created_at,
          t.organization_id,
          (
            CASE 
              WHEN LOWER(c.name) = LOWER($1) THEN 100
              WHEN LOWER(c.name) LIKE LOWER($1) || '%' THEN 75
              ELSE 50
            END
          )::float AS relevance,
          json_build_object('teamId', c.team_id, 'isPrivate', c.is_private, 'teamName', t.name) AS metadata
        FROM channels c
        JOIN teams t ON t.id = c.team_id AND t.deleted_at IS NULL
        JOIN organization_members om ON om.organization_id = t.organization_id AND om.user_id = $2 AND om.status = 'active'
        LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
        LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
        WHERE t.organization_id = ANY($3::uuid[])
          AND c.deleted_at IS NULL
          AND (
            (t.is_private = false AND om.role != 'guest') OR
            tm.user_id IS NOT NULL OR
            om.role IN ('owner', 'admin')
          )
          AND (
            (c.is_private = false AND (tm.user_id IS NOT NULL OR om.role IN ('owner', 'admin'))) OR
            (c.is_private = true AND (cm.user_id IS NOT NULL OR tm.role = 'lead' OR om.role IN ('owner', 'admin')))
          )
          AND (
            c.name ILIKE '%' || $1 || '%' OR
            c.description ILIKE '%' || $1 || '%'
          )
      )
      SELECT * FROM scored_channels c
      WHERE 1=1 ${cursorClause}
      ORDER BY relevance DESC, created_at DESC, id DESC
      LIMIT $4
    `;

    const res = await db.query<RawSearchRow>(sql, params);
    return res.rows.map(this.mapRow);
  }

  /**
   * Searches conversations where caller is an explicit member.
   */
  async searchConversations(
    query: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData,
    db: Queryable = pool
  ): Promise<SearchResultItem[]> {
    if (orgIds.length === 0) return [];

    let cursorClause = '';
    const params: unknown[] = [query, callerId, orgIds, limit];

    if (cursor) {
      params.push(cursor.relevance, cursor.createdAt, cursor.id);
      cursorClause = `
        AND (
          relevance < $5 OR
          (relevance = $5 AND (conv.created_at < $6 OR (conv.created_at = $6 AND conv.id < $7)))
        )
      `;
    }

    const sql = `
      WITH scored_convs AS (
        SELECT 
          conv.id,
          'conversation'::text AS type,
          COALESCE(conv.title, 'Direct Conversation') AS title,
          conv.type AS subtitle,
          NULL::text AS snippet,
          conv.created_at,
          conv.organization_id,
          (
            CASE 
              WHEN LOWER(COALESCE(conv.title, '')) = LOWER($1) THEN 100
              WHEN LOWER(COALESCE(conv.title, '')) LIKE LOWER($1) || '%' THEN 75
              ELSE 50
            END
          )::float AS relevance,
          json_build_object('type', conv.type) AS metadata
        FROM conversations conv
        JOIN conversation_members cm ON cm.conversation_id = conv.id AND cm.user_id = $2
        WHERE conv.organization_id = ANY($3::uuid[])
          AND conv.is_archived = false
          AND (
            conv.title ILIKE '%' || $1 || '%' OR
            EXISTS (
              SELECT 1 FROM conversation_members other_cm
              JOIN users u ON u.id = other_cm.user_id
              WHERE other_cm.conversation_id = conv.id
                AND other_cm.user_id != $2
                AND (u.display_name ILIKE '%' || $1 || '%' OR u.full_name ILIKE '%' || $1 || '%')
            )
          )
      )
      SELECT * FROM scored_convs conv
      WHERE 1=1 ${cursorClause}
      ORDER BY relevance DESC, created_at DESC, id DESC
      LIMIT $4
    `;

    const res = await db.query<RawSearchRow>(sql, params);
    return res.rows.map(this.mapRow);
  }

  /**
   * Searches message content across authorized channels and conversations.
   */
  async searchMessages(
    query: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData,
    db: Queryable = pool
  ): Promise<SearchResultItem[]> {
    if (orgIds.length === 0) return [];

    let cursorClause = '';
    const params: unknown[] = [query, callerId, orgIds, limit];

    if (cursor) {
      params.push(cursor.relevance, cursor.createdAt, cursor.id);
      cursorClause = `
        AND (
          relevance < $5 OR
          (relevance = $5 AND (m.created_at < $6 OR (m.created_at = $6 AND m.id < $7)))
        )
      `;
    }

    const sql = `
      WITH scored_messages AS (
        SELECT 
          m.id,
          'message'::text AS type,
          COALESCE(u.display_name, 'Unknown Sender') AS title,
          CASE 
            WHEN c.id IS NOT NULL THEN '#' || c.name 
            WHEN conv.id IS NOT NULL THEN COALESCE(conv.title, 'Direct Message')
            ELSE 'Message'
          END AS subtitle,
          SUBSTRING(m.content FROM 1 FOR 180) AS snippet,
          m.created_at,
          COALESCE(t.organization_id, conv.organization_id) AS organization_id,
          ROUND((
            CASE 
              WHEN LOWER(m.content) = LOWER($1) THEN 100
              WHEN LOWER(m.content) LIKE '%' || LOWER($1) || '%' THEN 60
              ELSE 40
            END + 
            ts_rank_cd(to_tsvector('english', m.content), plainto_tsquery('english', $1)) * 20
          )::numeric, 2)::float AS relevance,
          json_build_object(
            'channelId', m.channel_id,
            'conversationId', m.conversation_id,
            'senderId', m.sender_id,
            'parentMessageId', m.parent_message_id
          ) AS metadata
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN channels c ON c.id = m.channel_id AND c.deleted_at IS NULL
        LEFT JOIN teams t ON t.id = c.team_id AND t.deleted_at IS NULL
        LEFT JOIN organization_members om_c ON om_c.organization_id = t.organization_id AND om_c.user_id = $2 AND om_c.status = 'active'
        LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
        LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
        LEFT JOIN conversations conv ON conv.id = m.conversation_id AND conv.is_archived = false
        LEFT JOIN conversation_members cm_conv ON cm_conv.conversation_id = conv.id AND cm_conv.user_id = $2
        WHERE m.is_deleted = false
          AND m.deleted_at IS NULL
          AND (
            (
              m.channel_id IS NOT NULL 
              AND t.organization_id = ANY($3::uuid[])
              AND (
                (t.is_private = false AND om_c.role != 'guest') OR
                tm.user_id IS NOT NULL OR
                om_c.role IN ('owner', 'admin')
              )
              AND (
                (c.is_private = false AND (tm.user_id IS NOT NULL OR om_c.role IN ('owner', 'admin'))) OR
                (c.is_private = true AND (cm.user_id IS NOT NULL OR tm.role = 'lead' OR om_c.role IN ('owner', 'admin')))
              )
            )
            OR
            (
              m.conversation_id IS NOT NULL
              AND conv.organization_id = ANY($3::uuid[])
              AND cm_conv.user_id IS NOT NULL
            )
          )
          AND (
            m.content ILIKE '%' || $1 || '%' OR
            to_tsvector('english', m.content) @@ plainto_tsquery('english', $1)
          )
      )
      SELECT * FROM scored_messages m
      WHERE 1=1 ${cursorClause}
      ORDER BY relevance DESC, created_at DESC, id DESC
      LIMIT $4
    `;

    const res = await db.query<RawSearchRow>(sql, params);
    return res.rows.map(this.mapRow);
  }

  /**
   * Searches meetings in caller's active organizations.
   */
  async searchMeetings(
    query: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData,
    db: Queryable = pool
  ): Promise<SearchResultItem[]> {
    if (orgIds.length === 0) return [];

    let cursorClause = '';
    const params: unknown[] = [query, callerId, orgIds, limit];

    if (cursor) {
      params.push(cursor.relevance, cursor.createdAt, cursor.id);
      cursorClause = `
        AND (
          relevance < $5 OR
          (relevance = $5 AND (meet.created_at < $6 OR (meet.created_at = $6 AND meet.id < $7)))
        )
      `;
    }

    const sql = `
      WITH scored_meetings AS (
        SELECT 
          meet.id,
          'meeting'::text AS type,
          meet.title AS title,
          COALESCE(u.display_name, 'Meeting') AS subtitle,
          meet.description AS snippet,
          meet.created_at,
          meet.organization_id,
          (
            CASE 
              WHEN LOWER(meet.title) = LOWER($1) THEN 100
              WHEN LOWER(meet.title) LIKE LOWER($1) || '%' THEN 75
              ELSE 50
            END
          )::float AS relevance,
          json_build_object(
            'scheduledStartAt', meet.scheduled_start_at,
            'scheduledEndAt', meet.scheduled_end_at,
            'status', meet.status,
            'hostId', meet.host_id
          ) AS metadata
        FROM meetings meet
        JOIN users u ON u.id = meet.host_id
        JOIN organization_members om ON om.organization_id = meet.organization_id AND om.user_id = $2 AND om.status = 'active'
        LEFT JOIN meeting_participants mp ON mp.meeting_id = meet.id AND mp.user_id = $2
        WHERE meet.organization_id = ANY($3::uuid[])
          AND meet.status IN ('scheduled', 'active', 'ended')
          AND (
            meet.host_id = $2 OR
            mp.user_id IS NOT NULL OR
            om.role IN ('owner', 'admin', 'member')
          )
          AND (
            meet.title ILIKE '%' || $1 || '%' OR
            meet.description ILIKE '%' || $1 || '%'
          )
      )
      SELECT * FROM scored_meetings meet
      WHERE 1=1 ${cursorClause}
      ORDER BY relevance DESC, created_at DESC, id DESC
      LIMIT $4
    `;

    const res = await db.query<RawSearchRow>(sql, params);
    return res.rows.map(this.mapRow);
  }

  /**
   * Searches files according to Phase 8 authorization.
   */
  async searchFiles(
    query: string,
    callerId: string,
    orgIds: string[],
    limit: number,
    cursor?: SearchCursorData,
    db: Queryable = pool
  ): Promise<SearchResultItem[]> {
    if (orgIds.length === 0) return [];

    let cursorClause = '';
    const params: unknown[] = [query, callerId, orgIds, limit];

    if (cursor) {
      params.push(cursor.relevance, cursor.createdAt, cursor.id);
      cursorClause = `
        AND (
          relevance < $5 OR
          (relevance = $5 AND (f.created_at < $6 OR (f.created_at = $6 AND f.id < $7)))
        )
      `;
    }

    const sql = `
      WITH scored_files AS (
        SELECT 
          f.id,
          'file'::text AS type,
          f.file_name AS title,
          f.mime_type AS subtitle,
          NULL::text AS snippet,
          f.created_at,
          f.organization_id,
          (
            CASE 
              WHEN LOWER(f.file_name) = LOWER($1) THEN 100
              WHEN LOWER(f.file_name) LIKE LOWER($1) || '%' THEN 75
              ELSE 50
            END
          )::float AS relevance,
          json_build_object(
            'fileSizeBytes', f.file_size_bytes,
            'mimeType', f.mime_type,
            'uploaderId', f.uploader_id
          ) AS metadata
        FROM files f
        JOIN organization_members om ON om.organization_id = f.organization_id AND om.user_id = $2 AND om.status = 'active'
        WHERE f.organization_id = ANY($3::uuid[])
          AND f.is_deleted = false
          AND f.status = 'ready'
          AND (
            EXISTS (
              SELECT 1 FROM message_attachments ma
              JOIN messages m ON m.id = ma.message_id AND m.is_deleted = false
              JOIN channels c ON c.id = m.channel_id AND c.deleted_at IS NULL
              JOIN teams t ON t.id = c.team_id AND t.deleted_at IS NULL
              LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
              LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
              WHERE ma.file_id = f.id
                AND (
                  (t.is_private = false AND om.role != 'guest') OR
                  tm.user_id IS NOT NULL OR
                  om.role IN ('owner', 'admin')
                )
                AND (
                  (c.is_private = false AND (tm.user_id IS NOT NULL OR om.role IN ('owner', 'admin'))) OR
                  (c.is_private = true AND (cm.user_id IS NOT NULL OR tm.role = 'lead' OR om.role IN ('owner', 'admin')))
                )
            )
            OR
            EXISTS (
              SELECT 1 FROM message_attachments ma
              JOIN messages m ON m.id = ma.message_id AND m.is_deleted = false
              JOIN conversations conv ON conv.id = m.conversation_id AND conv.is_archived = false
              JOIN conversation_members cm_conv ON cm_conv.conversation_id = conv.id AND cm_conv.user_id = $2
              WHERE ma.file_id = f.id
            )
            OR
            (
              NOT EXISTS (SELECT 1 FROM message_attachments ma WHERE ma.file_id = f.id)
              AND (
                f.uploader_id = $2 OR
                (om.role != 'guest' AND om.role IN ('owner', 'admin', 'member'))
              )
            )
          )
          AND (
            f.file_name ILIKE '%' || $1 || '%'
          )
      )
      SELECT * FROM scored_files f
      WHERE 1=1 ${cursorClause}
      ORDER BY relevance DESC, created_at DESC, id DESC
      LIMIT $4
    `;

    const res = await db.query<RawSearchRow>(sql, params);
    return res.rows.map(this.mapRow);
  }

  private mapRow(row: RawSearchRow): SearchResultItem {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      subtitle: row.subtitle || undefined,
      snippet: row.snippet || undefined,
      timestamp: row.created_at.toISOString(),
      relevance: row.relevance,
      resourceType: row.type,
      resourceId: row.id,
      organizationId: row.organization_id || undefined,
      metadata: row.metadata || undefined,
    };
  }
}

export const searchRepository = new SearchRepository();
