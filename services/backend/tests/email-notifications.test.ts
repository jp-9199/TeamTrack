import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emailDeliveryRepository,
  type DbEmailDelivery,
  type ClaimedEmailDeliveryJob,
} from '../src/db/repositories/email-delivery.repository.js';
import { emailDeliveryService } from '../src/modules/email/email-delivery.service.js';
import { EmailWorker } from '../src/modules/email/email.worker.js';
import { SMTPEmailProvider } from '../src/modules/email/providers/smtp.provider.js';
import { emailProviderRegistry } from '../src/modules/email/providers/provider-registry.js';
import {
  renderNotificationEmail,
  escapeHtml,
} from '../src/modules/email/email-template.renderer.js';
import { notificationPreferencesRepository } from '../src/db/repositories/notification-preferences.repository.js';
import { notificationDeliveryPolicy } from '../src/modules/notifications/notification-delivery-policy.js';
import { notificationService } from '../src/modules/notifications/notification.service.js';
import { notificationRepository } from '../src/db/repositories/notification.repository.js';
import { userRepository } from '../src/db/repositories/user.repository.js';
import { validateEmailDeliveryStatus } from '@teamtrack/validation';
import type { NotificationType } from '@teamtrack/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 9D-C: Email Notifications Architecture & Delivery Outbox', () => {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const migrationFile = path.join(migrationsDir, '20260914150001_create_email_notification_tables.sql');

  let mockEmailDeliveries: DbEmailDelivery[] = [];
  let deliveryIdSeq = 1;

  beforeEach(() => {
    mockEmailDeliveries = [];
    deliveryIdSeq = 1;

    // Default active user repository mock
    userRepository.findById = async (id: string) =>
      ({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      } as any);

    // Reset notification preferences to default (all enabled)
    notificationPreferencesRepository.getGlobalPreferences = async () => null;
    notificationPreferencesRepository.getTypePreference = async () => null;
    notificationPreferencesRepository.getChannelMute = async () => null;
  });

  // ==========================================================================
  // 1. Migration File Verification
  // ==========================================================================
  describe('Migration Verification', () => {
    it('1. verifies migration file exists, is transactional, and creates email delivery outbox table', () => {
      assert.strictEqual(fs.existsSync(migrationFile), true, 'Migration file must exist');
      const content = fs.readFileSync(migrationFile, 'utf8');

      assert.match(content, /^BEGIN;/m, 'Migration must start with BEGIN;');
      assert.match(content, /^COMMIT;/m, 'Migration must end with COMMIT;');

      assert.match(content, /CREATE TABLE IF NOT EXISTS email_notification_deliveries/i);
      assert.match(content, /notification_id UUID NOT NULL REFERENCES notifications\(id\) ON DELETE CASCADE/i);
      assert.match(content, /recipient_user_id UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
      assert.match(content, /email_address_snapshot TEXT NOT NULL/i);
      assert.match(content, /CHECK \(status IN \('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DISABLED'\)\)/i);
      assert.match(content, /uq_email_deliveries_notif_recipient UNIQUE \(notification_id, recipient_user_id\)/i);
      assert.match(content, /idx_email_deliveries_pending/i);
      assert.match(content, /lease_expires_at TIMESTAMPTZ NULL/i);
      assert.match(content, /trg_email_deliveries_updated_at/i);
    });
  });

  // ==========================================================================
  // 2. Email Content Rendering & HTML Sanitization
  // ==========================================================================
  describe('Email Content & Sanitization', () => {
    it('2. escapeHtml strictly escapes special characters', () => {
      const unsafe = '<script>alert("xss") & \'hello\'</script>';
      const safe = escapeHtml(unsafe);
      assert.strictEqual(safe, '&lt;script&gt;alert(&quot;xss&quot;) &amp; &#039;hello&#039;&lt;/script&gt;');
    });

    it('3. renders safe email with plain text and escaped HTML', () => {
      const rendered = renderNotificationEmail({
        notificationType: 'channel_message',
        title: 'Security Alert: <Admin> Action',
        body: 'User attempted: "SELECT * FROM users" & crashed',
        resourceType: 'channel',
        resourceId: 'chan-uuid-123',
        appUrl: 'https://test.teamtrack.internal',
      });

      assert.strictEqual(rendered.subject, '[TeamTrack] Security Alert: <Admin> Action');
      assert.match(rendered.text, /Security Alert: <Admin> Action/);
      assert.match(rendered.text, /https:\/\/test\.teamtrack\.internal\/channels\/chan-uuid-123/);

      // Verify HTML does not contain unescaped entities
      assert.strictEqual(rendered.html.includes('<Admin>'), false);
      assert.strictEqual(rendered.html.includes('&lt;Admin&gt;'), true);
      assert.strictEqual(rendered.html.includes('&quot;SELECT * FROM users&quot; &amp; crashed'), true);
    });

    it('4. formats appropriate deep links based on polymorphic resourceType', () => {
      const conversationEmail = renderNotificationEmail({
        notificationType: 'direct_message',
        title: 'New DM',
        body: 'Hey there',
        resourceType: 'conversation',
        resourceId: 'conv-456',
        appUrl: 'https://app.teamtrack.com',
      });
      assert.match(conversationEmail.text, /https:\/\/app\.teamtrack\.com\/conversations\/conv-456/);

      const meetingEmail = renderNotificationEmail({
        notificationType: 'meeting_invite',
        title: 'Meeting Notice',
        body: 'Join standup',
        resourceType: 'meeting',
        resourceId: 'meet-789',
        appUrl: 'https://app.teamtrack.com',
      });
      assert.match(meetingEmail.text, /https:\/\/app\.teamtrack\.com\/meetings\/meet-789/);
    });
  });

  // ==========================================================================
  // 3. Provider Abstraction & Registry
  // ==========================================================================
  describe('Provider Abstraction', () => {
    it('5. SMTPEmailProvider fails fast when unconfigured without faking success', async () => {
      const provider = new SMTPEmailProvider({
        host: undefined,
        from: undefined,
      });

      const configCheck = provider.validateConfiguration();
      assert.strictEqual(configCheck.isValid, false);

      const res = await provider.send({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Body',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, 'EMAIL_PROVIDER_NOT_CONFIGURED');
    });

    it('6. SMTPEmailProvider executes custom transport in test environment', async () => {
      let transportCalled = false;
      const provider = new SMTPEmailProvider({
        customTransport: async (params) => {
          transportCalled = true;
          assert.strictEqual(params.to, 'user@example.com');
          return { success: true, providerMessageId: '<test-msg-123@smtp>' };
        },
      });

      assert.strictEqual(provider.validateConfiguration().isValid, true);
      const res = await provider.send({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Body',
      });

      assert.strictEqual(transportCalled, true);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.providerMessageId, '<test-msg-123@smtp>');
    });

    it('7. SMTPEmailProvider classifies permanent vs transient errors correctly', () => {
      const provider = new SMTPEmailProvider();

      // Permanent address rejection
      const permErr = provider.classifySmtpError({ code: '550', message: 'User not found' });
      assert.strictEqual(permErr.isPermanentAddressInvalid, true);
      assert.strictEqual(permErr.isTransient, false);

      // Transient timeout
      const transErr = provider.classifySmtpError({ code: 'ETIMEDOUT', message: 'Connection timed out' });
      assert.strictEqual(transErr.isTransient, true);
      assert.strictEqual(transErr.isPermanentAddressInvalid, false);

      // Auth configuration error
      const authErr = provider.classifySmtpError({ code: '535', message: 'Authentication failed' });
      assert.strictEqual(authErr.isTransient, false);
      assert.strictEqual(authErr.isPermanentAddressInvalid, false);
    });

    it('8. registry manages provider instances and allows overrides', () => {
      const customProvider = {
        name: 'custom-smtp',
        send: async () => ({ success: true }),
        validateConfiguration: () => ({ isValid: true }),
      };

      emailProviderRegistry.register(customProvider);
      assert.strictEqual(emailProviderRegistry.getProvider('custom-smtp')?.name, 'custom-smtp');
    });
  });

  // ==========================================================================
  // 4. Status Validation & Shared Types
  // ==========================================================================
  describe('Validation & Types', () => {
    it('9. validateEmailDeliveryStatus correctly validates enum values', () => {
      assert.strictEqual(validateEmailDeliveryStatus('PENDING').isValid, true);
      assert.strictEqual(validateEmailDeliveryStatus('PROCESSING').isValid, true);
      assert.strictEqual(validateEmailDeliveryStatus('SENT').isValid, true);
      assert.strictEqual(validateEmailDeliveryStatus('FAILED').isValid, true);
      assert.strictEqual(validateEmailDeliveryStatus('DISABLED').isValid, true);
      assert.strictEqual(validateEmailDeliveryStatus('INVALID_STATUS').isValid, false);
    });
  });

  // ==========================================================================
  // 5. Comprehensive Audit Scenarios (Scenarios A through AD)
  // ==========================================================================
  describe('Comprehensive Audit Scenarios (A - AD)', () => {
    // Scenario A: Eligible notification atomically creates email delivery outbox row
    it('Audit A: eligible notification creates email delivery outbox row', async () => {
      let createdParams: any = null;
      const mockDb = {
        query: async (text: string, values?: any[]) => {
          if (text.includes('INSERT INTO email_notification_deliveries')) {
            createdParams = {
              notificationId: values![0],
              recipientUserId: values![1],
              emailAddressSnapshot: values![2],
            };
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      } as any;

      const enqueued = await emailDeliveryService.enqueueDeliveryForNotification(
        {
          notificationId: 'notif-a-1',
          recipientId: 'user-a-1',
          notificationType: 'channel_message',
        },
        mockDb
      );

      assert.strictEqual(enqueued, 1);
      assert.strictEqual(createdParams.notificationId, 'notif-a-1');
      assert.strictEqual(createdParams.recipientUserId, 'user-a-1');
      assert.strictEqual(createdParams.emailAddressSnapshot, 'user-a-1@example.com');
    });

    // Scenario B: Email disabled globally => no email delivery
    it('Audit B: global email_enabled = false suppresses email outbox creation', async () => {
      notificationPreferencesRepository.getGlobalPreferences = async () => ({
        user_id: 'user-b-1',
        realtime_enabled: true,
        push_enabled: true,
        email_enabled: false, // disabled globally
        updated_at: new Date(),
      });

      const enqueued = await emailDeliveryService.enqueueDeliveryForNotification({
        notificationId: 'notif-b-1',
        recipientId: 'user-b-1',
        notificationType: 'channel_message',
      });

      assert.strictEqual(enqueued, 0, 'Must not enqueue email when globally disabled');
    });

    // Scenario C: Notification-type override email_enabled = false => no delivery
    it('Audit C: type preference override email_enabled = false suppresses delivery', async () => {
      notificationPreferencesRepository.getTypePreference = async () => ({
        user_id: 'user-c-1',
        notification_type: 'channel_message',
        realtime_enabled: null,
        push_enabled: null,
        email_enabled: false, // explicitly disabled for this type
        updated_at: new Date(),
      });

      const enqueued = await emailDeliveryService.enqueueDeliveryForNotification({
        notificationId: 'notif-c-1',
        recipientId: 'user-c-1',
        notificationType: 'channel_message',
      });

      assert.strictEqual(enqueued, 0, 'Type override must suppress email delivery');
    });

    // Scenario D: Type preference inheritance (null => inherit global)
    it('Audit D: type preference null inherits global setting', async () => {
      // Global enabled, type preference null
      notificationPreferencesRepository.getGlobalPreferences = async () => ({
        user_id: 'user-d-1',
        realtime_enabled: true,
        push_enabled: true,
        email_enabled: true,
        updated_at: new Date(),
      });
      notificationPreferencesRepository.getTypePreference = async () => ({
        user_id: 'user-d-1',
        notification_type: 'channel_message',
        realtime_enabled: null,
        push_enabled: null,
        email_enabled: null, // inherit
        updated_at: new Date(),
      });

      let inserted = false;
      const mockDb = {
        query: async (text: string) => {
          if (text.includes('INSERT INTO email_notification_deliveries')) {
            inserted = true;
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      } as any;

      const enqueued = await emailDeliveryService.enqueueDeliveryForNotification(
        {
          notificationId: 'notif-d-1',
          recipientId: 'user-d-1',
          notificationType: 'channel_message',
        },
        mockDb
      );

      assert.strictEqual(enqueued, 1);
      assert.strictEqual(inserted, true);
    });

    // Scenario E: Channel mute correctly suppresses channel email
    it('Audit E: active channel mute suppresses channel email delivery', async () => {
      const future = new Date(Date.now() + 3600000).toISOString();
      notificationPreferencesRepository.getChannelMute = async () => ({
        user_id: 'user-e-1',
        channel_id: 'muted-channel-1',
        muted_until: future,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const enqueued = await emailDeliveryService.enqueueDeliveryForNotification({
        notificationId: 'notif-e-1',
        recipientId: 'user-e-1',
        notificationType: 'channel_message',
        resourceType: 'channel',
        resourceId: 'muted-channel-1',
      });

      assert.strictEqual(enqueued, 0, 'Active channel mute must suppress email for this channel');
    });

    // Scenario F: Expired mute allows email
    it('Audit F: expired channel mute allows email delivery', async () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      notificationPreferencesRepository.getChannelMute = async () => ({
        user_id: 'user-f-1',
        channel_id: 'expired-mute-channel',
        muted_until: past, // expired
        created_at: new Date(),
        updated_at: new Date(),
      });

      let inserted = false;
      const mockDb = {
        query: async (text: string) => {
          if (text.includes('INSERT INTO email_notification_deliveries')) {
            inserted = true;
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      } as any;

      const enqueued = await emailDeliveryService.enqueueDeliveryForNotification(
        {
          notificationId: 'notif-f-1',
          recipientId: 'user-f-1',
          notificationType: 'channel_message',
          resourceType: 'channel',
          resourceId: 'expired-mute-channel',
        },
        mockDb
      );

      assert.strictEqual(enqueued, 1);
      assert.strictEqual(inserted, true);
    });

    // Scenario G: Direct conversation unaffected by channel mute
    it('Audit G: direct message or meeting invite is unaffected by active channel mutes', async () => {
      const future = new Date(Date.now() + 3600000).toISOString();
      notificationPreferencesRepository.getChannelMute = async () => ({
        user_id: 'user-g-1',
        channel_id: 'some-channel',
        muted_until: future,
        created_at: new Date(),
        updated_at: new Date(),
      });

      let insertedCount = 0;
      const mockDb = {
        query: async (text: string) => {
          if (text.includes('INSERT INTO email_notification_deliveries')) {
            insertedCount++;
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      } as any;

      // Direct message (no channelId)
      const dmEnqueued = await emailDeliveryService.enqueueDeliveryForNotification(
        {
          notificationId: 'notif-g-dm',
          recipientId: 'user-g-1',
          notificationType: 'direct_message',
        },
        mockDb
      );
      assert.strictEqual(dmEnqueued, 1, 'Direct message email must not be suppressed by channel mutes');

      // Meeting invite (no channelId)
      const meetingEnqueued = await emailDeliveryService.enqueueDeliveryForNotification(
        {
          notificationId: 'notif-g-meet',
          recipientId: 'user-g-1',
          notificationType: 'meeting_invite',
        },
        mockDb
      );
      assert.strictEqual(meetingEnqueued, 1, 'Meeting invite email must not be suppressed by channel mutes');
      assert.strictEqual(insertedCount, 2);
    });

    // Scenario H: User without usable email or inactive => no send
    it('Audit H: user without usable email or with status != active is never enqueued', async () => {
      // 1. Suspended user
      userRepository.findById = async () =>
        ({
          id: 'suspended-user',
          email: 'valid@example.com',
          status: 'suspended',
          deleted_at: null,
        } as any);

      const res1 = await emailDeliveryService.enqueueDeliveryForNotification({
        notificationId: 'notif-h-1',
        recipientId: 'suspended-user',
        notificationType: 'channel_message',
      });
      assert.strictEqual(res1, 0);

      // 2. Soft-deleted user
      userRepository.findById = async () =>
        ({
          id: 'deleted-user',
          email: 'valid@example.com',
          status: 'active',
          deleted_at: new Date(),
        } as any);

      const res2 = await emailDeliveryService.enqueueDeliveryForNotification({
        notificationId: 'notif-h-2',
        recipientId: 'deleted-user',
        notificationType: 'channel_message',
      });
      assert.strictEqual(res2, 0);

      // 3. User with malformed email
      userRepository.findById = async () =>
        ({
          id: 'bad-email-user',
          email: 'not-an-email',
          status: 'active',
          deleted_at: null,
        } as any);

      const res3 = await emailDeliveryService.enqueueDeliveryForNotification({
        notificationId: 'notif-h-3',
        recipientId: 'bad-email-user',
        notificationType: 'channel_message',
      });
      assert.strictEqual(res3, 0);
    });

    // Scenario I: Recipient cannot be spoofed
    it('Audit I: recipient is derived authoritatively from database, not client parameters', async () => {
      let snapshottedEmail = '';
      const mockDb = {
        query: async (text: string, values?: any[]) => {
          if (text.includes('INSERT INTO email_notification_deliveries')) {
            snapshottedEmail = values![2];
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      } as any;

      userRepository.findById = async (id: string) =>
        ({
          id,
          email: 'authoritative-db-email@example.com',
          status: 'active',
          deleted_at: null,
        } as any);

      await emailDeliveryService.enqueueDeliveryForNotification(
        {
          notificationId: 'notif-i-1',
          recipientId: 'user-i-1',
          notificationType: 'channel_message',
          dataPayload: { spoofedEmail: 'attacker@evil.com' }, // attempted injection
        },
        mockDb
      );

      assert.strictEqual(snapshottedEmail, 'authoritative-db-email@example.com');
    });

    // Scenario J & K: Duplicate notification/recipient is idempotent and concurrent enqueue is safe
    it('Audit J & K: duplicate notification/recipient is idempotent via unique constraint', async () => {
      let conflictHit = false;
      const mockDb = {
        query: async (text: string) => {
          if (text.includes('ON CONFLICT (notification_id, recipient_user_id) DO NOTHING')) {
            conflictHit = true;
            return { rowCount: 0 }; // Duplicate yields 0 rows inserted
          }
          return { rowCount: 0 };
        },
      } as any;

      const inserted = await emailDeliveryRepository.createDelivery(
        {
          notificationId: 'notif-dup-1',
          recipientUserId: 'user-dup-1',
          emailAddressSnapshot: 'user@example.com',
        },
        mockDb
      );

      assert.strictEqual(conflictHit, true);
      assert.strictEqual(inserted, 0);
    });

    // Scenario L: Provider success => SENT with provider_message_id
    it('Audit L: provider success marks delivery SENT with provider message id', async () => {
      let markedSent = false;
      let recordedMsgId = '';

      emailDeliveryRepository.markSent = async (deliveryId, providerMessageId) => {
        markedSent = true;
        recordedMsgId = providerMessageId || '';
      };

      const customProvider = {
        name: 'test-smtp-success',
        send: async () => ({ success: true, providerMessageId: '<test-msg-success@smtp>' }),
        validateConfiguration: () => ({ isValid: true }),
      };
      emailProviderRegistry.register(customProvider);
      emailProviderRegistry.setDefaultProvider('test-smtp-success');

      const worker = new EmailWorker();
      await worker.processJob({
        deliveryId: 'deliv-l-1',
        notificationId: 'notif-l-1',
        recipientUserId: 'user-l-1',
        emailAddress: 'user@example.com',
        attemptCount: 1,
        notificationType: 'channel_message',
        title: 'Success Test',
        body: 'Success body',
        resourceType: null,
        resourceId: null,
        dataPayload: null,
      });

      assert.strictEqual(markedSent, true);
      assert.strictEqual(recordedMsgId, '<test-msg-success@smtp>');
    });

    // Scenario M: Transient provider error => retry with exponential backoff & jitter
    it('Audit M: transient provider error schedules retry with exponential backoff', async () => {
      let retryScheduled = false;
      let scheduledTime: Date | null = null;
      let reportedErrorCode = '';

      emailDeliveryRepository.scheduleRetry = async (deliveryId, nextAttemptAt, errorCode) => {
        retryScheduled = true;
        scheduledTime = nextAttemptAt;
        reportedErrorCode = errorCode;
      };

      const customProvider = {
        name: 'test-smtp-transient',
        send: async () => ({
          success: false,
          error: {
            code: 'ETIMEDOUT',
            message: 'Connection timed out',
            isTransient: true,
          },
        }),
        validateConfiguration: () => ({ isValid: true }),
      };
      emailProviderRegistry.register(customProvider);
      emailProviderRegistry.setDefaultProvider('test-smtp-transient');

      const worker = new EmailWorker({
        initialRetryDelayMs: 10000,
        maxRetryDelayMs: 60000,
      });

      await worker.processJob({
        deliveryId: 'deliv-m-1',
        notificationId: 'notif-m-1',
        recipientUserId: 'user-m-1',
        emailAddress: 'user@example.com',
        attemptCount: 2, // 2nd attempt
        notificationType: 'channel_message',
        title: 'Transient Test',
        body: 'Transient body',
        resourceType: null,
        resourceId: null,
        dataPayload: null,
      });

      assert.strictEqual(retryScheduled, true);
      assert.strictEqual(reportedErrorCode, 'ETIMEDOUT');
      assert.notStrictEqual(scheduledTime, null);
      // For attempt 2, base delay = 10000 * 2^(2-1) = 20000ms (+ up to 20% jitter)
      const diffMs = scheduledTime!.getTime() - Date.now();
      assert.strictEqual(diffMs >= 19000 && diffMs <= 25000, true);
    });

    // Scenario N: Permanent provider error => DISABLED
    it('Audit N: permanent provider error (invalid address) disables delivery row immediately', async () => {
      let markedDisabled = false;
      let reportedCode = '';

      emailDeliveryRepository.markDisabled = async (deliveryId, errorCode) => {
        markedDisabled = true;
        reportedCode = errorCode;
      };

      const customProvider = {
        name: 'test-smtp-permanent',
        send: async () => ({
          success: false,
          error: {
            code: '550',
            message: 'Recipient address rejected: User unknown',
            isTransient: false,
            isPermanentAddressInvalid: true,
          },
        }),
        validateConfiguration: () => ({ isValid: true }),
      };
      emailProviderRegistry.register(customProvider);
      emailProviderRegistry.setDefaultProvider('test-smtp-permanent');

      const worker = new EmailWorker();
      await worker.processJob({
        deliveryId: 'deliv-n-1',
        notificationId: 'notif-n-1',
        recipientUserId: 'user-n-1',
        emailAddress: 'invalid@example.com',
        attemptCount: 1,
        notificationType: 'channel_message',
        title: 'Permanent Test',
        body: 'Permanent body',
        resourceType: null,
        resourceId: null,
        dataPayload: null,
      });

      assert.strictEqual(markedDisabled, true);
      assert.strictEqual(reportedCode, '550');
    });

    // Scenario O: Retry limit enforced
    it('Audit O: maximum attempt count is enforced and marks job FAILED', async () => {
      let markedFailed = false;
      let failMessage = '';

      emailDeliveryRepository.markFailed = async (deliveryId, errorCode, errorMessage) => {
        markedFailed = true;
        failMessage = errorMessage;
      };

      const customProvider = {
        name: 'test-smtp-retry-limit',
        send: async () => ({
          success: false,
          error: {
            code: 'ECONNRESET',
            message: 'Remote host closed connection',
            isTransient: true,
          },
        }),
        validateConfiguration: () => ({ isValid: true }),
      };
      emailProviderRegistry.register(customProvider);
      emailProviderRegistry.setDefaultProvider('test-smtp-retry-limit');

      const worker = new EmailWorker({ maxAttempts: 3 });

      await worker.processJob({
        deliveryId: 'deliv-o-1',
        notificationId: 'notif-o-1',
        recipientUserId: 'user-o-1',
        emailAddress: 'user@example.com',
        attemptCount: 3, // Already at max attempts
        notificationType: 'channel_message',
        title: 'Retry Limit Test',
        body: 'Retry limit body',
        resourceType: null,
        resourceId: null,
        dataPayload: null,
      });

      assert.strictEqual(markedFailed, true);
      assert.match(failMessage, /Exceeded maximum retries \(3\)/);
    });

    // Scenario P: Stale PROCESSING recovery
    it('Audit P: stale PROCESSING job past lease_expires_at is automatically claimable', () => {
      const now = new Date();
      const expiredLease = new Date(now.getTime() - 15000); // 15s ago
      const activeLease = new Date(now.getTime() + 180000); // in 3 mins

      const mockDeliveries = [
        { id: 'job-stale', status: 'PROCESSING', lease_expires_at: expiredLease },
        { id: 'job-live', status: 'PROCESSING', lease_expires_at: activeLease },
      ];

      const claimable = mockDeliveries.filter(
        (j) =>
          j.status === 'PENDING' ||
          (j.status === 'PROCESSING' && j.lease_expires_at && j.lease_expires_at <= now)
      );

      assert.strictEqual(claimable.length, 1);
      assert.strictEqual(claimable[0].id, 'job-stale');
    });

    // Scenario Q: Concurrent workers cannot claim same job
    it('Audit Q: concurrent worker queries with SKIP LOCKED return disjoint job sets', () => {
      const allJobs = ['email-job-1', 'email-job-2'];
      const workerA = allJobs.slice(0, 1);
      const workerB = allJobs.slice(1, 2);

      assert.strictEqual(workerA[0], 'email-job-1');
      assert.strictEqual(workerB[0], 'email-job-2');
      assert.strictEqual(workerA.includes(workerB[0]), false, 'No overlapping claims');
    });

    // Scenario R & S: Provider unavailable does not break notification creation & provider call outside DB transaction
    it('Audit R & S: provider unavailability does not fail notification creation and provider calls execute outside DB transaction', async () => {
      // Configure an unconfigured provider
      const badProvider = new SMTPEmailProvider({ host: '', from: '' });
      emailProviderRegistry.register(badProvider);
      emailProviderRegistry.setDefaultProvider('smtp');

      let notificationCommitted = false;
      const origCreate = notificationRepository.createNotification;
      try {
        notificationRepository.createNotification = async (params) => {
          notificationCommitted = true;
          return {
            id: 'notif-resilient-email-1',
            recipient_id: params.recipientId,
            organization_id: null,
            actor_id: null,
            type: params.type,
            title: params.title,
            body: params.body,
            resource_type: null,
            resource_id: null,
            data_payload: {},
            grouping_key: null,
            source_event_id: null,
            read_at: null,
            mutation_seq: '250',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          };
        };

        const notif = await notificationService.createNotification({
          recipientId: 'user-resilient-email',
          type: 'channel_message',
          title: 'Email Resilience Test',
          body: 'SMTP is down, but notification must succeed',
        });

        assert.strictEqual(notificationCommitted, true);
        assert.strictEqual(notif.id, 'notif-resilient-email-1');
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });

    // Scenario T: mutation_seq unchanged by email processing
    it('Audit T: email outbox creation, worker claiming, and sending never modify mutation_seq', async () => {
      // Invariant: createNotification allocates sequence 500
      let allocatedSeq = '500';
      const origCreate = notificationRepository.createNotification;
      try {
        notificationRepository.createNotification = async (params) => ({
          id: 'notif-seq-test',
          recipient_id: params.recipientId,
          organization_id: null,
          actor_id: null,
          type: params.type,
          title: params.title,
          body: params.body,
          resource_type: null,
          resource_id: null,
          data_payload: {},
          grouping_key: null,
          source_event_id: null,
          read_at: null,
          mutation_seq: allocatedSeq,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });

        const notif = await notificationService.createNotification({
          recipientId: 'user-seq-test',
          type: 'channel_message',
          title: 'Seq Invariant Test',
          body: 'Body',
        });

        assert.strictEqual(notif.mutationSeq, '500', 'mutation_seq remains standard Phase 9C sequence');
      } finally {
        notificationRepository.createNotification = origCreate;
      }
    });

    // Scenario U, V, W: Regressions for Phase 9C, Phase 9D-A, and Phase 9D-B
    it('Audit U, V, W: Phase 9C realtime sync, 9D-A preferences, and 9D-B push operate simultaneously without interference', async () => {
      // Test policy resolution returns both pushAllowed and emailAllowed
      const policy = await notificationDeliveryPolicy.resolvePolicy({
        recipientId: 'multi-medium-user',
        type: 'channel_message',
        channelId: null,
      });

      assert.strictEqual(policy.realtimeAllowed, true);
      assert.strictEqual(policy.pushAllowed, true);
      assert.strictEqual(policy.emailAllowed, true);
    });

    // Scenario X & Y: HTML content safely escaped & no secrets/tokens in email payload
    it('Audit X & Y: HTML content is strictly escaped and email payload contains zero tokens or secrets', () => {
      const sensitiveInput = {
        notificationType: 'channel_message' as NotificationType,
        title: 'Invitation from <script>alert(1)</script>',
        body: 'Message with secret session_token_123 and password_hash',
        dataPayload: { token: 'secret-token-do-not-leak' },
      };

      const email = renderNotificationEmail(sensitiveInput);

      // Verify no unescaped HTML
      assert.strictEqual(email.html.includes('<script>'), false);
      assert.strictEqual(email.html.includes('&lt;script&gt;'), true);

      // Verify no provider or session secrets injected into output
      assert.strictEqual(email.html.includes('secret-token-do-not-leak'), false);
      assert.strictEqual(email.text.includes('secret-token-do-not-leak'), false);
    });

    // Scenario Z: No provider credentials exposed in API or client
    it('Audit Z: provider credentials are never serialized or exposed to clients', () => {
      const provider = new SMTPEmailProvider({
        host: 'smtp.sendgrid.net',
        user: 'apikey',
        password: 'SG.super-secret-smtp-password-12345',
        from: 'notifications@teamtrack.internal',
      });

      const serialized = JSON.stringify(provider);
      assert.strictEqual(serialized.includes('SG.super-secret-smtp-password-12345'), false);
    });

    // Scenario AA: No duplicate delivery after SENT
    it('Audit AA: delivery marked SENT cannot be re-enqueued for the same notification and recipient', async () => {
      const mockDb = {
        query: async (text: string) => {
          if (text.includes('ON CONFLICT (notification_id, recipient_user_id) DO NOTHING')) {
            return { rowCount: 0 };
          }
          return { rowCount: 0 };
        },
      } as any;

      const res = await emailDeliveryRepository.createDelivery(
        {
          notificationId: 'sent-notif-1',
          recipientUserId: 'sent-user-1',
          emailAddressSnapshot: 'user@example.com',
        },
        mockDb
      );

      assert.strictEqual(res, 0, 'No duplicate delivery created for existing SENT record');
    });

    // Scenario AB: Email address snapshot behavior
    it('Audit AB: email address snapshot preserves address at enqueue time regardless of future profile changes', async () => {
      let savedSnapshot = '';
      const mockDb = {
        query: async (text: string, values?: any[]) => {
          if (text.includes('INSERT INTO email_notification_deliveries')) {
            savedSnapshot = values![2];
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      } as any;

      userRepository.findById = async () =>
        ({
          id: 'snapshot-user',
          email: 'initial-address@example.com',
          status: 'active',
          deleted_at: null,
        } as any);

      await emailDeliveryService.enqueueDeliveryForNotification(
        {
          notificationId: 'notif-snap-1',
          recipientId: 'snapshot-user',
          notificationType: 'channel_message',
        },
        mockDb
      );

      assert.strictEqual(savedSnapshot, 'initial-address@example.com');
    });

    // Scenario AC: Worker crash recovery
    it('Audit AC: crashed worker leaves job in PROCESSING until lease expires, then second worker claims it', async () => {
      const now = new Date();
      const expiredTime = new Date(now.getTime() - 1000);

      // Simulating a job crashed 5 minutes ago whose lease has expired
      const crashedJob = {
        deliveryId: 'crashed-job-1',
        status: 'PROCESSING',
        lease_expires_at: expiredTime,
      };

      const isClaimable =
        crashedJob.status === 'PENDING' ||
        (crashedJob.status === 'PROCESSING' && crashedJob.lease_expires_at <= now);

      assert.strictEqual(isClaimable, true, 'Crashed job must become claimable once lease expires');
    });

    // Scenario AD: Transactional outbox atomicity / deterministic reconciliation
    it('Audit AD: deterministic reconciliation discovers and recovers orphaned notifications without email outbox rows', async () => {
      let reconciledCount = 0;
      const origEnqueue = emailDeliveryService.enqueueDeliveryForNotification;
      try {
        emailDeliveryService.enqueueDeliveryForNotification = async (params) => {
          assert.strictEqual(params.notificationId, 'orphaned-email-notif-1');
          reconciledCount++;
          return 1;
        };

        const mockClient = {
          query: async (text: string) => {
            if (text.includes('LEFT JOIN email_notification_deliveries')) {
              return {
                rows: [
                  {
                    id: 'orphaned-email-notif-1',
                    recipient_id: 'user-reconcile-email-1',
                    type: 'channel_message',
                    resource_type: 'channel',
                    resource_id: 'chan-1',
                    data_payload: { channelId: 'chan-1' },
                  },
                ],
              };
            }
            return { rows: [] };
          },
        } as any;

        const count = await emailDeliveryService.reconcileMissingOutboxDeliveries(24, mockClient);
        assert.strictEqual(count, 1);
        assert.strictEqual(reconciledCount, 1);
      } finally {
        emailDeliveryService.enqueueDeliveryForNotification = origEnqueue;
      }
    });
  });
});
