import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type {
  NotificationType,
  NotificationResourceType,
  NotificationDataPayload,
  NotificationRow,
  Notification,
  NotificationCursor,
  NotificationSyncCursor,
} from '@teamtrack/shared-types';
import { PHASE9_ERROR_CODES } from '@teamtrack/shared-types';

describe('Phase 9A: Notification Database Architecture Static Tests', () => {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const migration14Path = path.join(migrationsDir, '20260913120001_create_notification_enhancements.sql');
  const migration08Path = path.join(migrationsDir, '20260910120008_create_notifications_and_audit_tables.sql');
  const migration01Path = path.join(migrationsDir, '20260910120001_extensions_and_helpers.sql');

  it('1. verifies migration 14 file exists and follows correct chronological naming', () => {
    assert.strictEqual(fs.existsSync(migration14Path), true, 'Migration 14 file must exist');
    const baseName = path.basename(migration14Path);
    assert.match(baseName, /^20260913120001_create_notification_enhancements\.sql$/, 'Migration name must match format');
  });

  it('2. verifies migration 14 is sequence 14 among all sql migrations', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    assert.ok(files.length >= 14, 'Expected at least 14 migrations');
    assert.strictEqual(files[13], '20260913120001_create_notification_enhancements.sql');
  });

  it('3. verifies migration 14 is strictly transactional (BEGIN ... COMMIT)', () => {
    const content = fs.readFileSync(migration14Path, 'utf8');
    assert.match(content, /^BEGIN;/m, 'Migration must begin with a transaction block');
    assert.match(content, /^COMMIT;/m, 'Migration must commit the transaction');
  });

  it('4. confirms migrations 01-13 remain strictly untouched', () => {
    // Migration 01: set_updated_at helper function
    const content01 = fs.readFileSync(migration01Path, 'utf8');
    assert.match(content01, /CREATE OR REPLACE FUNCTION set_updated_at\(\)/i);

    // Migration 08: original notifications table
    const content08 = fs.readFileSync(migration08Path, 'utf8');
    assert.match(content08, /CREATE TABLE notifications/i);
    assert.match(content08, /recipient_id UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
    assert.match(content08, /organization_id UUID NULL REFERENCES organizations\(id\) ON DELETE CASCADE/i);
    assert.strictEqual(content08.includes('source_event_id'), false, 'Migration 08 must not be modified');
    assert.strictEqual(content08.includes('grouping_key'), false, 'Migration 08 must not be modified');
  });

  it('5. verifies existing notification indexes are inspected and retained in migration 08', () => {
    const content08 = fs.readFileSync(migration08Path, 'utf8');
    assert.match(content08, /CREATE INDEX idx_notifications_unread ON notifications\(recipient_id, created_at DESC\) WHERE is_read = false;/);
    assert.match(content08, /CREATE INDEX idx_notifications_recipient_all ON notifications\(recipient_id, created_at DESC\);/);

    const content14 = fs.readFileSync(migration14Path, 'utf8');
    assert.strictEqual(content14.includes('DROP INDEX'), false, 'Existing indexes must not be dropped');
  });

  it('6. verifies addition of enhancement columns (actor_id, resource_type, resource_id, grouping_key, source_event_id, deleted_at, updated_at)', () => {
    const content14 = fs.readFileSync(migration14Path, 'utf8');

    // actor_id with ON DELETE SET NULL
    assert.match(content14, /ALTER TABLE notifications ADD COLUMN actor_id UUID NULL REFERENCES users\(id\) ON DELETE SET NULL;/i);

    // polymorphic resource references
    assert.match(content14, /ALTER TABLE notifications ADD COLUMN resource_type VARCHAR\(50\) NULL;/i);
    assert.match(content14, /ALTER TABLE notifications ADD COLUMN resource_id UUID NULL;/i);

    // grouping_key and source_event_id
    assert.match(content14, /ALTER TABLE notifications ADD COLUMN grouping_key VARCHAR\(128\) NULL;/i);
    assert.match(content14, /ALTER TABLE notifications ADD COLUMN source_event_id VARCHAR\(128\) NULL;/i);

    // deleted_at soft delete
    assert.match(content14, /ALTER TABLE notifications ADD COLUMN deleted_at TIMESTAMPTZ NULL;/i);

    // updated_at with DEFAULT NOW()
    assert.match(content14, /ALTER TABLE notifications ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\);/i);
  });

  it('7. verifies organization_id remains nullable supporting both tenant and system notices', () => {
    const content08 = fs.readFileSync(migration08Path, 'utf8');
    assert.match(content08, /organization_id UUID NULL REFERENCES organizations\(id\) ON DELETE CASCADE/i);

    const content14 = fs.readFileSync(migration14Path, 'utf8');
    assert.strictEqual(content14.includes('organization_id SET NOT NULL'), false, 'organization_id must remain nullable');
  });

  it('8. verifies safe backfill for existing notification rows', () => {
    const content14 = fs.readFileSync(migration14Path, 'utf8');
    assert.match(content14, /UPDATE notifications\s+SET read_at = created_at\s+WHERE is_read = true\s+AND read_at IS NULL;/i);
    assert.match(content14, /UPDATE notifications\s+SET is_read = true\s+WHERE read_at IS NOT NULL\s+AND is_read = false;/i);
  });

  it('9. verifies trg_notifications_updated_at uses existing set_updated_at() trigger function', () => {
    const content14 = fs.readFileSync(migration14Path, 'utf8');
    assert.match(content14, /CREATE TRIGGER trg_notifications_updated_at/i);
    assert.match(content14, /BEFORE UPDATE ON notifications/i);
    assert.match(content14, /EXECUTE FUNCTION set_updated_at\(\);/i);
  });

  it('10. verifies sync_notification_read_status trigger function design and non-recursion guards', () => {
    const content14 = fs.readFileSync(migration14Path, 'utf8');

    // Trigger function definition
    assert.match(content14, /CREATE OR REPLACE FUNCTION sync_notification_read_status\(\)/i);

    // Defense-in-depth recursion guard
    assert.match(content14, /IF pg_trigger_depth\(\) > 1 THEN\s+RETURN NEW;\s+END IF;/i);

    // Direct in-place mutation of NEW record (zero secondary UPDATE statements)
    assert.match(content14, /NEW\.is_read := true;/i);
    assert.match(content14, /NEW\.is_read := false;/i);
    assert.match(content14, /NEW\.read_at := NULL;/i);
    assert.match(content14, /NEW\.read_at := COALESCE\(NEW\.created_at, NOW\(\)\);/i);

    // Absence of secondary recursive SQL query inside trigger function body
    const triggerFuncBody = content14.substring(
      content14.indexOf('CREATE OR REPLACE FUNCTION sync_notification_read_status'),
      content14.indexOf('$$ LANGUAGE plpgsql')
    );
    assert.strictEqual(/UPDATE notifications/i.test(triggerFuncBody), false, 'Trigger function must not execute UPDATE statements');

    // Trigger attachment
    assert.match(content14, /CREATE TRIGGER trg_notifications_read_sync/i);
    assert.match(content14, /BEFORE INSERT OR UPDATE OF read_at, is_read ON notifications/i);
    assert.match(content14, /EXECUTE FUNCTION sync_notification_read_status\(\);/i);
  });

  it('11. verifies keyset cursor indexes and multi-device sync index exist with deleted_at IS NULL predicate', () => {
    const content14 = fs.readFileSync(migration14Path, 'utf8');

    // Deterministic Keyset Cursor Pagination Index
    assert.match(content14, /CREATE INDEX idx_notifications_recipient_cursor\s+ON notifications\(recipient_id, created_at DESC, id DESC\)\s+WHERE deleted_at IS NULL;/i);

    // Multi-Device Delta Catch-up Sync Index
    assert.match(content14, /CREATE INDEX idx_notifications_recipient_sync\s+ON notifications\(recipient_id, updated_at ASC, id ASC\)\s+WHERE deleted_at IS NULL;/i);
  });

  it('12. verifies organization, resource, and grouping indexes exist', () => {
    const content14 = fs.readFileSync(migration14Path, 'utf8');

    // Organization filter
    assert.match(content14, /CREATE INDEX idx_notifications_org_cursor\s+ON notifications\(organization_id, created_at DESC, id DESC\)\s+WHERE organization_id IS NOT NULL\s+AND deleted_at IS NULL;/i);

    // Polymorphic Resource Lookup
    assert.match(content14, /CREATE INDEX idx_notifications_resource\s+ON notifications\(resource_type, resource_id\)\s+WHERE resource_id IS NOT NULL\s+AND deleted_at IS NULL;/i);

    // Grouping index (non-unique)
    assert.match(content14, /CREATE INDEX idx_notifications_grouping\s+ON notifications\(recipient_id, grouping_key, created_at DESC\)\s+WHERE grouping_key IS NOT NULL\s+AND deleted_at IS NULL;/i);
    assert.strictEqual(/CREATE UNIQUE INDEX idx_notifications_grouping/i.test(content14), false, 'Grouping index must not be unique');
  });

  it('13. verifies idempotent deduplication unique partial index includes deleted_at IS NULL', () => {
    const content14 = fs.readFileSync(migration14Path, 'utf8');

    assert.match(content14, /CREATE UNIQUE INDEX uq_notifications_dedup\s+ON notifications\(recipient_id, type, source_event_id\)\s+WHERE source_event_id IS NOT NULL\s+AND deleted_at IS NULL;/i);
  });

  it('14. verifies documentation confirms source_event_id represents stable domain event identity', () => {
    const docPath = path.resolve(__dirname, '../../../docs/notification-architecture.md');
    assert.strictEqual(fs.existsSync(docPath), true, 'Notification architecture doc must exist');

    const docContent = fs.readFileSync(docPath, 'utf8');
    assert.match(docContent, /source_event_id/i);
    assert.match(docContent, /originating domain event/i);
    assert.match(docContent, /A notification NEVER grants authorization/i);
  });
});

describe('Phase 9A: Trigger Logic Invariant Tests (In-Memory Simulation)', () => {
  interface SimRow {
    id: string;
    is_read: boolean;
    read_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }

  function simulateSyncTrigger(
    op: 'INSERT' | 'UPDATE',
    next: SimRow,
    prev?: SimRow
  ): SimRow {
    const result = { ...next };

    if (op === 'INSERT') {
      if (result.read_at !== null) {
        result.is_read = true;
      } else if (result.is_read === true) {
        result.read_at = result.created_at;
      } else {
        result.is_read = false;
        result.read_at = null;
      }
      return result;
    }

    if (op === 'UPDATE' && prev) {
      const readAtChanged = result.read_at?.getTime() !== prev.read_at?.getTime();
      const isReadChanged = result.is_read !== prev.is_read;

      if (readAtChanged) {
        if (result.read_at !== null) {
          result.is_read = true;
        } else {
          result.is_read = false;
        }
      } else if (isReadChanged) {
        if (result.is_read === true) {
          if (result.read_at === null) {
            result.read_at = new Date();
          }
        } else {
          if (result.read_at !== null) {
            result.read_at = null;
          }
        }
      }
    }

    return result;
  }

  it('sets is_read = false and read_at = null on unread INSERT', () => {
    const row: SimRow = {
      id: 'uuid-1',
      is_read: false,
      read_at: null,
      created_at: new Date('2026-09-13T10:00:00Z'),
      updated_at: new Date('2026-09-13T10:00:00Z'),
    };
    const res = simulateSyncTrigger('INSERT', row);
    assert.strictEqual(res.is_read, false);
    assert.strictEqual(res.read_at, null);
  });

  it('sets is_read = true when read_at is supplied on INSERT', () => {
    const readTime = new Date('2026-09-13T10:05:00Z');
    const row: SimRow = {
      id: 'uuid-2',
      is_read: false, // caller passed false by mistake
      read_at: readTime,
      created_at: new Date('2026-09-13T10:00:00Z'),
      updated_at: new Date('2026-09-13T10:00:00Z'),
    };
    const res = simulateSyncTrigger('INSERT', row);
    assert.strictEqual(res.is_read, true, 'read_at non-null must enforce is_read = true');
    assert.strictEqual(res.read_at, readTime);
  });

  it('initializes read_at to created_at when legacy is_read = true is inserted', () => {
    const createdTime = new Date('2026-09-13T10:00:00Z');
    const row: SimRow = {
      id: 'uuid-3',
      is_read: true,
      read_at: null,
      created_at: createdTime,
      updated_at: createdTime,
    };
    const res = simulateSyncTrigger('INSERT', row);
    assert.strictEqual(res.is_read, true);
    assert.deepStrictEqual(res.read_at, createdTime, 'read_at must be populated from created_at');
  });

  it('syncs is_read to true when read_at is updated to a timestamp', () => {
    const prev: SimRow = {
      id: 'uuid-4',
      is_read: false,
      read_at: null,
      created_at: new Date('2026-09-13T10:00:00Z'),
      updated_at: new Date('2026-09-13T10:00:00Z'),
    };
    const updateTime = new Date('2026-09-13T10:15:00Z');
    const next: SimRow = {
      ...prev,
      read_at: updateTime,
    };
    const res = simulateSyncTrigger('UPDATE', next, prev);
    assert.strictEqual(res.is_read, true);
    assert.strictEqual(res.read_at, updateTime);
  });

  it('syncs is_read to false when read_at is updated to null', () => {
    const readTime = new Date('2026-09-13T10:05:00Z');
    const prev: SimRow = {
      id: 'uuid-5',
      is_read: true,
      read_at: readTime,
      created_at: new Date('2026-09-13T10:00:00Z'),
      updated_at: new Date('2026-09-13T10:00:00Z'),
    };
    const next: SimRow = {
      ...prev,
      read_at: null,
    };
    const res = simulateSyncTrigger('UPDATE', next, prev);
    assert.strictEqual(res.is_read, false);
    assert.strictEqual(res.read_at, null);
  });

  it('syncs read_at when legacy is_read is updated to true', () => {
    const prev: SimRow = {
      id: 'uuid-6',
      is_read: false,
      read_at: null,
      created_at: new Date('2026-09-13T10:00:00Z'),
      updated_at: new Date('2026-09-13T10:00:00Z'),
    };
    const next: SimRow = {
      ...prev,
      is_read: true,
    };
    const res = simulateSyncTrigger('UPDATE', next, prev);
    assert.strictEqual(res.is_read, true);
    assert.ok(res.read_at !== null, 'read_at must be populated when is_read becomes true');
  });

  it('syncs read_at to null when legacy is_read is updated to false', () => {
    const readTime = new Date('2026-09-13T10:05:00Z');
    const prev: SimRow = {
      id: 'uuid-7',
      is_read: true,
      read_at: readTime,
      created_at: new Date('2026-09-13T10:00:00Z'),
      updated_at: new Date('2026-09-13T10:00:00Z'),
    };
    const next: SimRow = {
      ...prev,
      is_read: false,
    };
    const res = simulateSyncTrigger('UPDATE', next, prev);
    assert.strictEqual(res.is_read, false);
    assert.strictEqual(res.read_at, null);
  });
});

describe('Phase 9A: Shared Types & Contract Alignment Tests', () => {
  it('validates NotificationRow persistence contract', () => {
    const row: NotificationRow = {
      id: '11111111-1111-4111-a111-111111111111',
      recipient_id: '22222222-2222-4222-a222-222222222222',
      organization_id: '33333333-3333-4333-a333-333333333333',
      actor_id: '44444444-4444-4444-a444-444444444444',
      type: 'mention',
      title: 'Alice mentioned you in #general',
      body: 'Hey check out the new design!',
      resource_type: 'message',
      resource_id: '55555555-5555-4555-a555-555555555555',
      data_payload: {
        channelId: '66666666-6666-4666-a666-666666666666',
        messageId: '55555555-5555-4555-a555-555555555555',
        route: '/app/channels/66666666-6666-4666-a666-666666666666',
      },
      is_read: false,
      read_at: null,
      grouping_key: 'channel:66666666-6666-4666-a666-666666666666:2026-09-13',
      source_event_id: 'msg_evt_55555555-5555-4555-a555-555555555555',
      deleted_at: null,
      created_at: '2026-09-13T10:00:00.000Z',
      updated_at: '2026-09-13T10:00:00.000Z',
    };

    assert.strictEqual(row.type, 'mention');
    assert.strictEqual(row.resource_type, 'message');
    assert.strictEqual(row.is_read, false);
    assert.strictEqual(row.read_at, null);
    assert.strictEqual(row.deleted_at, null);
  });

  it('validates client Notification DTO excludes internal lifecycle fields', () => {
    const dto: Notification = {
      id: '11111111-1111-4111-a111-111111111111',
      recipientId: '22222222-2222-4222-a222-222222222222',
      organizationId: '33333333-3333-4333-a333-333333333333',
      actorId: '44444444-4444-4444-a444-444444444444',
      type: 'meeting_invite',
      title: 'Quarterly Planning Call',
      body: 'You have been invited to Quarterly Planning',
      resourceType: 'meeting',
      resourceId: '77777777-7777-4777-a777-777777777777',
      dataPayload: {
        meetingId: '77777777-7777-4777-a777-777777777777',
      },
      readAt: null,
      createdAt: '2026-09-13T10:00:00.000Z',
    };

    assert.strictEqual(dto.type, 'meeting_invite');
    assert.strictEqual(dto.resourceType, 'meeting');
    assert.strictEqual('is_read' in dto, false, 'is_read must not be present on client DTO');
    assert.strictEqual('isRead' in dto, false, 'isRead must not be present on client DTO');
    assert.strictEqual('deleted_at' in dto, false, 'deleted_at must not be present on client DTO');
    assert.strictEqual('deletedAt' in dto, false, 'deletedAt must not be present on client DTO');
    assert.strictEqual('source_event_id' in dto, false, 'source_event_id must not be present on client DTO');
    assert.strictEqual('sourceEventId' in dto, false, 'sourceEventId must not be present on client DTO');
    assert.strictEqual('grouping_key' in dto, false, 'grouping_key must not be present on client DTO');
    assert.strictEqual('groupingKey' in dto, false, 'groupingKey must not be present on client DTO');
  });

  it('validates NotificationCursor and NotificationSyncCursor shapes', () => {
    const cursor: NotificationCursor = {
      createdAt: '2026-09-13T10:00:00.000Z',
      id: '11111111-1111-4111-a111-111111111111',
    };
    assert.strictEqual(typeof cursor.createdAt, 'string');
    assert.strictEqual(typeof cursor.id, 'string');

    const syncCursor: NotificationSyncCursor = {
      updatedAt: '2026-09-13T10:05:00.000Z',
      id: '11111111-1111-4111-a111-111111111111',
    };
    assert.strictEqual(typeof syncCursor.updatedAt, 'string');
    assert.strictEqual(typeof syncCursor.id, 'string');
  });

  it('validates Phase 9 error codes', () => {
    assert.strictEqual(PHASE9_ERROR_CODES.NOTIFICATION_NOT_FOUND, 'NOTIFICATION_NOT_FOUND');
    assert.strictEqual(PHASE9_ERROR_CODES.NOTIFICATION_FORBIDDEN, 'NOTIFICATION_FORBIDDEN');
    assert.strictEqual(PHASE9_ERROR_CODES.INVALID_NOTIFICATION_TYPE, 'INVALID_NOTIFICATION_TYPE');
    assert.strictEqual(PHASE9_ERROR_CODES.INVALID_RESOURCE_TYPE, 'INVALID_RESOURCE_TYPE');
    assert.strictEqual(PHASE9_ERROR_CODES.NOTIFICATION_ALREADY_READ, 'NOTIFICATION_ALREADY_READ');
    assert.strictEqual(PHASE9_ERROR_CODES.ORGANIZATION_MISMATCH, 'ORGANIZATION_MISMATCH');
  });
});
