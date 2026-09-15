import {
  emailDeliveryRepository,
  type ClaimedEmailDeliveryJob,
} from '../../db/repositories/email-delivery.repository.js';
import { emailProviderRegistry } from './providers/provider-registry.js';
import { renderNotificationEmail } from './email-template.renderer.js';

export interface EmailWorkerOptions {
  batchSize?: number;
  leaseDurationMs?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
}

export class EmailWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(options?: EmailWorkerOptions) {
    this.batchSize = options?.batchSize ?? 10;
    this.leaseDurationMs = options?.leaseDurationMs ?? 300000; // 5 minutes
    this.pollIntervalMs = options?.pollIntervalMs ?? 5000;
    this.maxAttempts = options?.maxAttempts ?? 5;
    this.initialRetryDelayMs = options?.initialRetryDelayMs ?? 10000; // 10 seconds
    this.maxRetryDelayMs = options?.maxRetryDelayMs ?? 3600000; // 1 hour
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextPoll();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      try {
        await this.processNextBatch();
      } catch (err: any) {
        console.error('[EmailWorker] Error processing batch:', err?.message || err);
      } finally {
        this.scheduleNextPoll();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Processes a single batch of pending/stale email delivery jobs.
   * Can be invoked directly by tests for deterministic verification.
   */
  async processNextBatch(): Promise<number> {
    const jobs = await emailDeliveryRepository.claimPendingDeliveries(
      this.batchSize,
      this.leaseDurationMs
    );

    if (jobs.length === 0) {
      return 0;
    }

    for (const job of jobs) {
      await this.processJob(job);
    }

    return jobs.length;
  }

  async processJob(job: ClaimedEmailDeliveryJob): Promise<void> {
    const provider = emailProviderRegistry.getProvider();

    if (!provider) {
      await emailDeliveryRepository.markFailed(
        job.deliveryId,
        'UNSUPPORTED_PROVIDER',
        'No email provider registered in registry'
      );
      return;
    }

    // Render email with safe HTML entity escaping and plain text fallback
    const rendered = renderNotificationEmail({
      notificationType: job.notificationType,
      title: job.title,
      body: job.body,
      resourceType: job.resourceType,
      resourceId: job.resourceId,
      dataPayload: job.dataPayload,
    });

    try {
      // Execute provider network call outside DB transaction
      const result = await provider.send({
        to: job.emailAddress,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      if (result.success) {
        await emailDeliveryRepository.markSent(
          job.deliveryId,
          result.providerMessageId || null
        );
        return;
      }

      const err = result.error || {
        code: 'UNKNOWN_EMAIL_ERROR',
        message: 'Email transmission failed with unknown error',
        isTransient: false,
        isPermanentAddressInvalid: false,
      };

      if (err.isPermanentAddressInvalid) {
        // Permanent address failure (e.g. 550 Mailbox Not Found / Address Rejected)
        // Mark delivery DISABLED without retrying to prevent reputation degradation
        await emailDeliveryRepository.markDisabled(job.deliveryId, err.code, err.message);
        return;
      }

      if (err.isTransient) {
        // Transient error (e.g. timeout, rate limit, temporary server error)
        if (job.attemptCount >= this.maxAttempts) {
          await emailDeliveryRepository.markFailed(
            job.deliveryId,
            err.code,
            `Exceeded maximum retries (${this.maxAttempts}): ${err.message}`
          );
        } else {
          // Bounded exponential backoff with 20% jitter
          const baseDelay = this.initialRetryDelayMs * Math.pow(2, job.attemptCount - 1);
          const jitter = Math.floor(Math.random() * (baseDelay * 0.2));
          const delay = Math.min(this.maxRetryDelayMs, baseDelay + jitter);
          const nextAttemptAt = new Date(Date.now() + delay);

          await emailDeliveryRepository.scheduleRetry(
            job.deliveryId,
            nextAttemptAt,
            err.code,
            err.message
          );
        }
        return;
      }

      // Permanent non-address error (e.g. provider credentials unconfigured/invalid)
      // Fail fast without generating a retry storm
      await emailDeliveryRepository.markFailed(job.deliveryId, err.code, err.message);
    } catch (err: any) {
      const msg = err?.message || 'Unexpected exception during email processing';
      if (job.attemptCount >= this.maxAttempts) {
        await emailDeliveryRepository.markFailed(
          job.deliveryId,
          'UNEXPECTED_ERROR',
          `Exceeded maximum retries (${this.maxAttempts}): ${msg}`
        );
      } else {
        const nextAttemptAt = new Date(Date.now() + this.initialRetryDelayMs);
        await emailDeliveryRepository.scheduleRetry(
          job.deliveryId,
          nextAttemptAt,
          'UNEXPECTED_ERROR',
          msg
        );
      }
    }
  }
}

export const emailWorker = new EmailWorker();
