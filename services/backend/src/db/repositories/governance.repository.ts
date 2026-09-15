import type { Pool, PoolClient } from 'pg';
import { pool } from '../pool.js';
import type {
  OrganizationGovernanceSettings,
  UpdateGovernanceSettingsRequest,
  DefaultNotificationBehavior,
} from '@teamtrack/shared-types';

export type Queryable = Pool | PoolClient;

export interface DbOrganizationGovernanceSettings {
  organization_id: string;
  ai_assistant_enabled: boolean;
  allow_guest_invites: boolean;
  default_notification_behavior: DefaultNotificationBehavior;
  created_at: Date;
  updated_at: Date;
}

export class GovernanceRepository {
  mapSettings(row: DbOrganizationGovernanceSettings): OrganizationGovernanceSettings {
    return {
      organizationId: row.organization_id,
      aiAssistantEnabled: row.ai_assistant_enabled,
      allowGuestInvites: row.allow_guest_invites,
      defaultNotificationBehavior: row.default_notification_behavior,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Retrieves governance settings for an organization.
   * Auto-provisions default settings if no record exists yet.
   */
  async getSettings(
    orgId: string,
    db: Queryable = pool
  ): Promise<DbOrganizationGovernanceSettings> {
    // Attempt lookup
    const existing = await db.query<DbOrganizationGovernanceSettings>(
      `SELECT organization_id, ai_assistant_enabled, allow_guest_invites,
              default_notification_behavior, created_at, updated_at
       FROM organization_governance_settings
       WHERE organization_id = $1
       LIMIT 1`,
      [orgId]
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }

    // Auto-provision defaults
    const insertRes = await db.query<DbOrganizationGovernanceSettings>(
      `INSERT INTO organization_governance_settings (
         organization_id, ai_assistant_enabled, allow_guest_invites, default_notification_behavior
       ) VALUES ($1, true, true, 'all')
       ON CONFLICT (organization_id) DO UPDATE SET updated_at = NOW()
       RETURNING organization_id, ai_assistant_enabled, allow_guest_invites,
                 default_notification_behavior, created_at, updated_at`,
      [orgId]
    );

    return insertRes.rows[0];
  }

  /**
   * Updates governance settings for an organization.
   */
  async updateSettings(
    orgId: string,
    updates: UpdateGovernanceSettingsRequest,
    db: Queryable = pool
  ): Promise<DbOrganizationGovernanceSettings> {
    // Ensure default exists first
    await this.getSettings(orgId, db);

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [orgId];
    let paramIdx = 2;

    if (updates.aiAssistantEnabled !== undefined) {
      setClauses.push(`ai_assistant_enabled = $${paramIdx++}`);
      values.push(updates.aiAssistantEnabled);
    }
    if (updates.allowGuestInvites !== undefined) {
      setClauses.push(`allow_guest_invites = $${paramIdx++}`);
      values.push(updates.allowGuestInvites);
    }
    if (updates.defaultNotificationBehavior !== undefined) {
      setClauses.push(`default_notification_behavior = $${paramIdx++}`);
      values.push(updates.defaultNotificationBehavior);
    }

    const res = await db.query<DbOrganizationGovernanceSettings>(
      `UPDATE organization_governance_settings
       SET ${setClauses.join(', ')}
       WHERE organization_id = $1
       RETURNING organization_id, ai_assistant_enabled, allow_guest_invites,
                 default_notification_behavior, created_at, updated_at`,
      values
    );

    return res.rows[0];
  }
}

export const governanceRepository = new GovernanceRepository();
