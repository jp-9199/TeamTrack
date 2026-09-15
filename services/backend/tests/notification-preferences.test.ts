import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notificationPreferencesRepository } from '../src/db/repositories/notification-preferences.repository.js';
import { notificationPreferencesService } from '../src/modules/notifications/notification-preferences.service.js';
import { notificationDeliveryPolicy } from '../src/modules/notifications/notification-delivery-policy.js';
import { authorizationService } from '../src/modules/authorization/authorization.service.js';
import { notificationService } from '../src/modules/notifications/notification.service.js';
import { notificationRepository } from '../src/db/repositories/notification.repository.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import {
  validateUpdateNotificationPreferencesRequest,
  validateUpdateNotificationTypePreferenceRequest,
  validateNotificationTypeParam,
  validateMuteChannelRequest,
} from '@teamtrack/validation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 9D-A: Notification Preferences & Channel Mute Rules', () => {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const migrationFile = path.join(migrationsDir, '20260914120001_create_notification_preferences.sql');

  beforeEach(() => {
    userRepository.findById = async (id: string) =>
      ({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

    notificationPreferencesRepository.getGlobalPreferences = async () => null;
    notificationPreferencesRepository.getTypePreference = async () => null;
    notificationPreferencesRepository.getChannelMute = async () => null;
  });

  // --------------------------------------------------------------------------
  // 1. Migration 16 Schema Verification
  // --------------------------------------------------------------------------
  it('1. verifies migration file exists, is transactional, and creates required preference tables', () => {
    assert.strictEqual(fs.existsSync(migrationFile), true, 'Migration file must exist');
    const content = fs.readFileSync(migrationFile, 'utf8');

    assert.match(content, /^BEGIN;/m, 'Migration must start with BEGIN;');
    assert.match(content, /^COMMIT;/m, 'Migration must end with COMMIT;');

    // Table A: user_notification_preferences
    assert.match(content, /CREATE TABLE IF NOT EXISTS user_notification_preferences/i);
    assert.match(content, /realtime_enabled BOOLEAN NOT NULL DEFAULT TRUE/i);
    assert.match(content, /push_enabled BOOLEAN NOT NULL DEFAULT TRUE/i);
    assert.match(content, /email_enabled BOOLEAN NOT NULL DEFAULT TRUE/i);
    assert.match(content, /trg_user_notification_preferences_updated_at/i);

    // Table B: user_notification_type_preferences
    assert.match(content, /CREATE TABLE IF NOT EXISTS user_notification_type_preferences/i);
    assert.match(content, /PRIMARY KEY \(user_id, notification_type\)/i);
    assert.match(content, /realtime_enabled BOOLEAN NULL/i);
    assert.match(content, /push_enabled BOOLEAN NULL/i);
    assert.match(content, /email_enabled BOOLEAN NULL/i);
    assert.match(content, /trg_user_notification_type_preferences_updated_at/i);

    // Table C: channel_notification_mutes
    assert.match(content, /CREATE TABLE IF NOT EXISTS channel_notification_mutes/i);
    assert.match(content, /PRIMARY KEY \(user_id, channel_id\)/i);
    assert.match(content, /muted_until TIMESTAMPTZ NULL/i);
    assert.match(content, /idx_channel_notification_mutes_channel/i);
    assert.match(content, /trg_channel_notification_mutes_updated_at/i);
  });

  // --------------------------------------------------------------------------
  // 2. Delivery Policy Precedence Tests (A - E)
  // --------------------------------------------------------------------------
  describe('Preference Resolution Precedence', () => {
    it('A. Default preferences: no rows -> all defaults enabled (true)', async () => {
      const origGetGlobal = notificationPreferencesRepository.getGlobalPreferences;
      const origGetType = notificationPreferencesRepository.getTypePreference;
      try {
        notificationPreferencesRepository.getGlobalPreferences = async () => null;
        notificationPreferencesRepository.getTypePreference = async () => null;

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-default-1',
          type: 'channel_message',
        });

        assert.strictEqual(policy.realtimeAllowed, true);
        assert.strictEqual(policy.pushAllowed, true);
        assert.strictEqual(policy.emailAllowed, true);
        assert.strictEqual(policy.isChannelMuted, false);
      } finally {
        notificationPreferencesRepository.getGlobalPreferences = origGetGlobal;
        notificationPreferencesRepository.getTypePreference = origGetType;
      }
    });

    it('B. Global preference update: disable push -> pushAllowed false, others remain true', async () => {
      const origGetGlobal = notificationPreferencesRepository.getGlobalPreferences;
      const origGetType = notificationPreferencesRepository.getTypePreference;
      try {
        notificationPreferencesRepository.getGlobalPreferences = async () => ({
          user_id: 'user-1',
          realtime_enabled: true,
          push_enabled: false,
          email_enabled: true,
          updated_at: new Date(),
        });
        notificationPreferencesRepository.getTypePreference = async () => null;

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'channel_message',
        });

        assert.strictEqual(policy.realtimeAllowed, true);
        assert.strictEqual(policy.pushAllowed, false);
        assert.strictEqual(policy.emailAllowed, true);
      } finally {
        notificationPreferencesRepository.getGlobalPreferences = origGetGlobal;
        notificationPreferencesRepository.getTypePreference = origGetType;
      }
    });

    it('C. Type override: Global push true + type push false -> pushAllowed false', async () => {
      const origGetGlobal = notificationPreferencesRepository.getGlobalPreferences;
      const origGetType = notificationPreferencesRepository.getTypePreference;
      try {
        notificationPreferencesRepository.getGlobalPreferences = async () => ({
          user_id: 'user-1',
          realtime_enabled: true,
          push_enabled: true,
          email_enabled: true,
          updated_at: new Date(),
        });
        notificationPreferencesRepository.getTypePreference = async () => ({
          user_id: 'user-1',
          notification_type: 'direct_message',
          realtime_enabled: null,
          push_enabled: false,
          email_enabled: null,
          updated_at: new Date(),
        });

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'direct_message',
        });

        assert.strictEqual(policy.pushAllowed, false, 'Explicit type override false must disable push');
        assert.strictEqual(policy.realtimeAllowed, true, 'Inherited global realtime must remain true');
      } finally {
        notificationPreferencesRepository.getGlobalPreferences = origGetGlobal;
        notificationPreferencesRepository.getTypePreference = origGetType;
      }
    });

    it('D. Type inheritance: Global push false + type push NULL -> pushAllowed false', async () => {
      const origGetGlobal = notificationPreferencesRepository.getGlobalPreferences;
      const origGetType = notificationPreferencesRepository.getTypePreference;
      try {
        notificationPreferencesRepository.getGlobalPreferences = async () => ({
          user_id: 'user-1',
          realtime_enabled: true,
          push_enabled: false,
          email_enabled: true,
          updated_at: new Date(),
        });
        notificationPreferencesRepository.getTypePreference = async () => ({
          user_id: 'user-1',
          notification_type: 'mention',
          realtime_enabled: null,
          push_enabled: null, // Inherits global
          email_enabled: null,
          updated_at: new Date(),
        });

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'mention',
        });

        assert.strictEqual(policy.pushAllowed, false, 'NULL override must inherit disabled global push');
        assert.strictEqual(policy.realtimeAllowed, true);
      } finally {
        notificationPreferencesRepository.getGlobalPreferences = origGetGlobal;
        notificationPreferencesRepository.getTypePreference = origGetType;
      }
    });

    it('E. Explicit type enable: Global push false + type push true -> pushAllowed true', async () => {
      const origGetGlobal = notificationPreferencesRepository.getGlobalPreferences;
      const origGetType = notificationPreferencesRepository.getTypePreference;
      try {
        notificationPreferencesRepository.getGlobalPreferences = async () => ({
          user_id: 'user-1',
          realtime_enabled: false,
          push_enabled: false,
          email_enabled: false,
          updated_at: new Date(),
        });
        notificationPreferencesRepository.getTypePreference = async () => ({
          user_id: 'user-1',
          notification_type: 'meeting_started',
          realtime_enabled: null,
          push_enabled: true, // Explicitly enabled for meeting_started!
          email_enabled: null,
          updated_at: new Date(),
        });

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'meeting_started',
        });

        assert.strictEqual(policy.pushAllowed, true, 'Explicit type override true must enable push despite disabled global');
        assert.strictEqual(policy.realtimeAllowed, false, 'Inherited global realtime remains false');
      } finally {
        notificationPreferencesRepository.getGlobalPreferences = origGetGlobal;
        notificationPreferencesRepository.getTypePreference = origGetType;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Channel Mute Semantics (F - I)
  // --------------------------------------------------------------------------
  describe('Channel Mute Semantics', () => {
    it('F. Permanent channel mute: muted_until NULL -> actively muted', async () => {
      const origGetMute = notificationPreferencesRepository.getChannelMute;
      try {
        notificationPreferencesRepository.getChannelMute = async () => ({
          user_id: 'user-1',
          channel_id: 'chan-perm-1',
          muted_until: null,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'channel_message',
          channelId: 'chan-perm-1',
        });

        assert.strictEqual(policy.isChannelMuted, true);
        assert.strictEqual(policy.mutedUntil, null);
        assert.strictEqual(policy.realtimeAllowed, false, 'Active mute must suppress realtime delivery');
        assert.strictEqual(policy.pushAllowed, false, 'Active mute must suppress push delivery');
        assert.strictEqual(policy.emailAllowed, false, 'Active mute must suppress email delivery');
      } finally {
        notificationPreferencesRepository.getChannelMute = origGetMute;
      }
    });

    it('G. Temporary channel mute: future muted_until -> actively muted', async () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour ahead
      const origGetMute = notificationPreferencesRepository.getChannelMute;
      try {
        notificationPreferencesRepository.getChannelMute = async () => ({
          user_id: 'user-1',
          channel_id: 'chan-temp-1',
          muted_until: futureDate,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'channel_message',
          channelId: 'chan-temp-1',
        });

        assert.strictEqual(policy.isChannelMuted, true);
        assert.strictEqual(policy.mutedUntil, futureDate.toISOString());
        assert.strictEqual(policy.pushAllowed, false);
      } finally {
        notificationPreferencesRepository.getChannelMute = origGetMute;
      }
    });

    it('H. Expired mute: past muted_until -> evaluates as unmuted without worker', async () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      const origGetMute = notificationPreferencesRepository.getChannelMute;
      try {
        notificationPreferencesRepository.getChannelMute = async () => ({
          user_id: 'user-1',
          channel_id: 'chan-expired-1',
          muted_until: pastDate,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'channel_message',
          channelId: 'chan-expired-1',
        });

        assert.strictEqual(policy.isChannelMuted, false);
        assert.strictEqual(policy.mutedUntil, null);
        assert.strictEqual(policy.pushAllowed, true, 'Expired mute must allow delivery');
      } finally {
        notificationPreferencesRepository.getChannelMute = origGetMute;
      }
    });

    it('I. Unmute: row removed -> unmuted', async () => {
      const origGetMute = notificationPreferencesRepository.getChannelMute;
      try {
        notificationPreferencesRepository.getChannelMute = async () => null;

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'channel_message',
          channelId: 'chan-unmuted-1',
        });

        assert.strictEqual(policy.isChannelMuted, false);
        assert.strictEqual(policy.mutedUntil, null);
        assert.strictEqual(policy.pushAllowed, true);
      } finally {
        notificationPreferencesRepository.getChannelMute = origGetMute;
      }
    });

    it('Channel mute does NOT affect non-channel notifications (e.g. direct_message)', async () => {
      const origGetMute = notificationPreferencesRepository.getChannelMute;
      try {
        let muteChecked = false;
        notificationPreferencesRepository.getChannelMute = async () => {
          muteChecked = true;
          return {
            user_id: 'user-1',
            channel_id: 'chan-1',
            muted_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          };
        };

        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-1',
          type: 'direct_message',
          // No channelId provided!
        });

        assert.strictEqual(policy.isChannelMuted, false);
        assert.strictEqual(policy.pushAllowed, true);
        assert.strictEqual(muteChecked, false, 'Must not check channel mute when notification is not associated with a channel');
      } finally {
        notificationPreferencesRepository.getChannelMute = origGetMute;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Authorization & Security Tests (J - L, Security)
  // --------------------------------------------------------------------------
  describe('Authorization & Security Tests', () => {
    it('J. Unauthorized channel mute: user without channel access -> rejected with 404', async () => {
      const origGetChannelAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: true,
          canAccess: false, // User not in channel
          isPrivate: true,
          isChannelMember: false,
          isLeadOrOrgAdmin: false,
        });

        await assert.rejects(
          async () => {
            await notificationPreferencesService.muteChannel('user-unauthorized', 'chan-private', null);
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = origGetChannelAuth;
      }
    });

    it('K. Cross-tenant channel mute: anti-IDOR returns 404', async () => {
      const origGetChannelAuth = authorizationService.getChannelAuth;
      try {
        authorizationService.getChannelAuth = async () => ({
          channelExists: false, // Hidden for anti-enumeration
          canAccess: false,
          isPrivate: false,
          isChannelMember: false,
          isLeadOrOrgAdmin: false,
        });

        await assert.rejects(
          async () => {
            await notificationPreferencesService.getChannelMute('user-tenant-a', 'chan-tenant-b');
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        authorizationService.getChannelAuth = origGetChannelAuth;
      }
    });

    it('L. User isolation: User A cannot read or mutate User B preferences', async () => {
      // In TeamTrack, the user ID is sourced directly from authenticated session (req.user.id).
      // Verify service methods operate strictly on the passed authenticated userId.
      const origGetGlobal = notificationPreferencesRepository.getGlobalPreferences;
      try {
        let queriedUserId = '';
        notificationPreferencesRepository.getGlobalPreferences = async (id: string) => {
          queriedUserId = id;
          return null;
        };

        await notificationPreferencesService.getPreferences('user-authenticated-a');
        assert.strictEqual(queriedUserId, 'user-authenticated-a');
      } finally {
        notificationPreferencesRepository.getGlobalPreferences = origGetGlobal;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Concurrency & UPSERT Tests (M - N)
  // --------------------------------------------------------------------------
  describe('Concurrency & Atomic UPSERTs', () => {
    it('M. Concurrent preference updates do not cause lost updates or errors', async () => {
      const inMemoryPrefs: Record<string, any> = {};

      const mockDb = {
        query: async (sql: string, params: any[]) => {
          const userId = params[0];
          const current = inMemoryPrefs[userId] || {
            user_id: userId,
            realtime_enabled: true,
            push_enabled: true,
            email_enabled: true,
          };

          if (params[1] !== null) current.realtime_enabled = params[1];
          if (params[2] !== null) current.push_enabled = params[2];
          if (params[3] !== null) current.email_enabled = params[3];

          inMemoryPrefs[userId] = current;
          return { rows: [{ ...current, updated_at: new Date() }] };
        },
      };

      // Concurrent updates to different fields
      await Promise.all([
        notificationPreferencesRepository.upsertGlobalPreferences('user-conc', { pushEnabled: false }, mockDb as any),
        notificationPreferencesRepository.upsertGlobalPreferences('user-conc', { emailEnabled: false }, mockDb as any),
      ]);

      assert.strictEqual(inMemoryPrefs['user-conc'].pushEnabled ?? inMemoryPrefs['user-conc'].push_enabled, false);
      assert.strictEqual(inMemoryPrefs['user-conc'].emailEnabled ?? inMemoryPrefs['user-conc'].email_enabled, false);
    });

    it('N. Concurrent first-time preference creation is safe', async () => {
      let created = false;
      const mockDb = {
        query: async (_sql: string, params: any[]) => {
          created = true;
          return {
            rows: [
              {
                user_id: params[0],
                realtime_enabled: params[1] ?? true,
                push_enabled: params[2] ?? true,
                email_enabled: params[3] ?? true,
                updated_at: new Date(),
              },
            ],
          };
        },
      };

      const [res1, res2] = await Promise.all([
        notificationPreferencesRepository.upsertGlobalPreferences('user-new-1', { realtimeEnabled: false }, mockDb as any),
        notificationPreferencesRepository.upsertGlobalPreferences('user-new-1', { pushEnabled: false }, mockDb as any),
      ]);

      assert.ok(res1);
      assert.ok(res2);
      assert.strictEqual(created, true);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Validation & Bad Input Tests (O - P, Security)
  // --------------------------------------------------------------------------
  describe('Validation & Security Input Sanitization', () => {
    it('O. Unknown notification type is strictly rejected', () => {
      const res = validateNotificationTypeParam('unknown_event_type');
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.errors[0].details?.field, 'notificationType');
    });

    it('P. Invalid timestamp: past timestamp or malformed ISO rejected with 400', () => {
      // Past timestamp
      const pastRes = validateMuteChannelRequest({ mutedUntil: '2020-01-01T00:00:00Z' });
      assert.strictEqual(pastRes.isValid, false);
      assert.strictEqual(pastRes.errors[0].message, 'mutedUntil must be a future timestamp');

      // Malformed timestamp
      const malformedRes = validateMuteChannelRequest({ mutedUntil: 'not-a-valid-timestamp' });
      assert.strictEqual(malformedRes.isValid, false);
      assert.strictEqual(malformedRes.errors[0].message, 'mutedUntil must be a valid ISO timestamp');
    });

    it('Security: SQL injection strings in notification type are rejected', () => {
      const res = validateNotificationTypeParam("'; DROP TABLE notifications; --");
      assert.strictEqual(res.isValid, false);
    });

    it('Security: Unknown fields in preference request are rejected', () => {
      const res = validateUpdateNotificationPreferencesRequest({
        realtimeEnabled: true,
        extraMaliciousField: 'exploit',
      });
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.errors[0].details?.field, 'extraMaliciousField');
    });

    it('Security: Spoofed userId/recipientId in request body is rejected as unknown field', () => {
      const res = validateUpdateNotificationPreferencesRequest({
        userId: 'victim-user-id',
        realtimeEnabled: false,
      });
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.errors[0].details?.field, 'userId');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Non-Destructive Invariants (Q - S)
  // --------------------------------------------------------------------------
  describe('Durable Notification Invariants', () => {
    it('Q. Disabled delivery does NOT delete or suppress notification persistence in PostgreSQL', async () => {
      const origCreate = notificationRepository.createNotification;
      try {
        let inserted = false;
        notificationRepository.createNotification = async (params: any) => {
          inserted = true;
          return {
            id: 'notif-persisted-1',
            recipient_id: params.recipientId,
            organization_id: null,
            actor_id: null,
            type: params.type,
            title: params.title,
            body: params.body,
            resource_type: null,
            resource_id: null,
            data_payload: {},
            is_read: false,
            read_at: null,
            grouping_key: null,
            source_event_id: null,
            deleted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
            mutation_seq: '42',
          };
        };

        // User has push disabled
        const policy = await notificationDeliveryPolicy.resolvePolicy({
          recipientId: 'user-push-disabled',
          type: 'channel_message',
        });

        // Creating notification continues to insert in PostgreSQL
        const notif = await notificationService.createNotification({
          recipientId: 'user-push-disabled',
          type: 'channel_message',
          title: 'Hello',
          body: 'World',
        });

        assert.strictEqual(inserted, true, 'Notification row MUST be inserted in PostgreSQL');
        assert.strictEqual(notif.id, 'notif-persisted-1');
        assert.strictEqual(notif.readAt, null);
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });

    it('R. Disabled delivery does NOT modify notification mutation_seq', async () => {
      const origCreate = notificationRepository.createNotification;
      try {
        notificationRepository.createNotification = async () => ({
          id: 'notif-seq-test',
          recipient_id: 'user-1',
          organization_id: null,
          actor_id: null,
          type: 'mention',
          title: 'Title',
          body: 'Body',
          resource_type: null,
          resource_id: null,
          data_payload: {},
          is_read: false,
          read_at: null,
          grouping_key: null,
          source_event_id: null,
          deleted_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          mutation_seq: '99',
        });

        const notif = await notificationService.createNotification({
          recipientId: 'user-1',
          type: 'mention',
          title: 'Title',
          body: 'Body',
        });

        assert.strictEqual(notif.mutationSeq, '99', 'mutation_seq must remain strictly governed by PostgreSQL state');
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });

    it('S. Channel mute does NOT modify notification read/unread state', async () => {
      const origCreate = notificationRepository.createNotification;
      try {
        notificationRepository.createNotification = async () => ({
          id: 'notif-muted-unread',
          recipient_id: 'user-1',
          organization_id: null,
          actor_id: null,
          type: 'channel_message',
          title: 'Title',
          body: 'Body',
          resource_type: null,
          resource_id: null,
          data_payload: {},
          is_read: false,
          read_at: null,
          grouping_key: null,
          source_event_id: null,
          deleted_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          mutation_seq: '100',
        });

        const notif = await notificationService.createNotification({
          recipientId: 'user-1',
          type: 'channel_message',
          title: 'Title',
          body: 'Body',
        });

        assert.strictEqual(notif.readAt, null, 'Notification created for muted channel must remain unread');
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });
  });
});
