import { pushDeliveryRepository, type ClaimedPushDeliveryJob } from '../../db/repositories/push-delivery.repository.js';
import { pushDeviceRepository } from '../../db/repositories/push-device.repository.js';
import { pushProviderRegistry } from './providers/provider-registry.js';
import type { PushNotificationPayload } from '@teamtrack/shared-types';

export interface PushWorkerOptions {
  batchSize?: number;
  leaseDurationMs?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
}

export class PushWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(options?: PushWorkerOptions) {
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
        console.error('[PushWorker] Error processing batch:', err?.message || err);
      } finally {
        this.scheduleNextPoll();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Processes a single batch of pending/stale delivery jobs.
   * Can be called directly by tests for deterministic verification.
   */
  async processNextBatch(): Promise<number> {
    const jobs = await pushDeliveryRepository.claimPendingDeliveries(
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

  async processJob(job: ClaimedPushDeliveryJob): Promise<void> {
    const provider = pushProviderRegistry.getProvider(job.provider);

    if (!provider) {
      await pushDeliveryRepository.markFailed(
        job.deliveryId,
        'UNSUPPORTED_PROVIDER',
        `No provider registered for ${job.provider}`
      );
      return;
    }

    // Build standardized payload (never include secrets, passwords, or raw tokens)
    const payload: PushNotificationPayload = {
      notificationId: job.notificationId,
      notificationType: job.notificationType,
      title: job.title,
      body: job.body,
      resourceType: (job.resourceType as any) || undefined,
      resourceId: job.resourceId || undefined,
      channelId: (job.dataPayload?.channelId as string) || undefined,
      conversationId: (job.dataPayload?.conversationId as string) || undefined,
      meetingId: (job.dataPayload?.meetingId as string) || undefined,
    };

    try {
      // Execute provider network call outside DB transaction
      const result = await provider.send({
        pushToken: job.pushToken,
        title: job.title,
        body: job.body,
        payload,
      });

      if (result.success) {
        await pushDeliveryRepository.markSent(job.deliveryId, result.providerMessageId || null);
        return;
      }

      const err = result.error || {
        code: 'UNKNOWN_ERROR',
        message: 'Push delivery failed with unknown error',
        isTransient: false,
        isPermanentTokenInvalid: false,
      };

      if (err.isPermanentTokenInvalid) {
        // Permanent token failure (e.g. Unregistered / BadDeviceToken):
        // 1. Mark delivery DISABLED
        // 2. Disable device to stop future deliveries
        await pushDeliveryRepository.markDisabled(job.deliveryId, err.code, err.message);
        await pushDeviceRepository.disableDevice(job.deviceId);
        return;
      }

      if (err.isTransient) {
        // Transient error (e.g. timeout, rate limit, provider 5xx):
        if (job.attemptCount >= this.maxAttempts) {
          // Exceeded retry limit
          await pushDeliveryRepository.markFailed(
            job.deliveryId,
            err.code,
            `Exceeded maximum retries (${this.maxAttempts}): ${err.message}`
          );
        } else {
          // Schedule exponential backoff with jitter
          const baseDelay = this.initialRetryDelayMs * Math.pow(2, job.attemptCount - 1);
          const jitter = Math.floor(Math.random() * (baseDelay * 0.2));
          const delay = Math.min(this.maxRetryDelayMs, baseDelay + jitter);
          const nextAttemptAt = new Date(Date.now() + delay);

          await pushDeliveryRepository.scheduleRetry(
            job.deliveryId,
            nextAttemptAt,
            err.code,
            err.message
          );
        }
        return;
      }

      // Permanent non-token failure (e.g. credentials missing/invalid, payload malformed):
      // Do NOT retry indefinitely.
      await pushDeliveryRepository.markFailed(job.deliveryId, err.code, err.message);
    } catch (err: any) {
      const msg = err?.message || 'Unexpected exception during push processing';
      if (job.attemptCount >= this.maxAttempts) {
        await pushDeliveryRepository.markFailed(
          job.deliveryId,
          'UNEXPECTED_ERROR',
          `Exceeded maximum retries (${this.maxAttempts}): ${msg}`
        );
      } else {
        const nextAttemptAt = new Date(Date.now() + this.initialRetryDelayMs);
        await pushDeliveryRepository.scheduleRetry(
          job.deliveryId,
          nextAttemptAt,
          'UNEXPECTED_ERROR',
          msg
        );
      }
    }
  }
}

export const pushWorker = new PushWorker();
