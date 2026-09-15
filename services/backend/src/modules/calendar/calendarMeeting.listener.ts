import { eventPublisher } from '../../realtime/event.publisher.js';
import { calendarRepository } from '../../db/repositories/calendar.repository.js';
import { calendarService } from './calendar.service.js';

export class CalendarMeetingListener {
  private isInitialized = false;

  /**
   * Initializes the meeting lifecycle event subscriptions for calendar synchronization.
   * Decoupled listener: MeetingService emits events; CalendarMeetingListener consumes them.
   */
  init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    eventPublisher.on('meeting.started', async (envelope) => {
      await this.handleMeetingStarted(envelope.payload as { meetingId: string; startedAt?: string });
    });

    eventPublisher.on('meeting.ended', async (envelope) => {
      await this.handleMeetingEnded(envelope.payload as { meetingId: string; endedAt?: string });
    });
  }

  /**
   * Handles meeting.started event.
   * Updates actual_start_at on linked calendar event and emits calendar.event.updated.
   * Idempotent: repeated calls do not corrupt timestamps.
   */
  async handleMeetingStarted(payload: { meetingId: string; startedAt?: string }): Promise<void> {
    if (!payload?.meetingId) return;

    const startedAt = payload.startedAt ? new Date(payload.startedAt) : new Date();
    const updated = await calendarRepository.syncMeetingStarted(payload.meetingId, startedAt);
    if (!updated) return; // Safe no-op if no calendar event is linked to this meeting

    try {
      const fullDetails = await (calendarService as any).hydrateEventDetails(updated);
      await (calendarService as any).publishRealtimeCalendarEvent('calendar.event.updated', fullDetails, 'updated');
    } catch (err: any) {
      console.error('[CalendarMeetingListener] Error publishing calendar update for meeting.started:', err.message);
    }
  }

  /**
   * Handles meeting.ended event.
   * Updates actual_end_at on linked calendar event and emits calendar.event.updated.
   * Idempotent: repeated calls do not corrupt timestamps.
   */
  async handleMeetingEnded(payload: { meetingId: string; endedAt?: string }): Promise<void> {
    if (!payload?.meetingId) return;

    const endedAt = payload.endedAt ? new Date(payload.endedAt) : new Date();
    const updated = await calendarRepository.syncMeetingEnded(payload.meetingId, endedAt);
    if (!updated) return; // Safe no-op if no calendar event is linked to this meeting

    try {
      const fullDetails = await (calendarService as any).hydrateEventDetails(updated);
      await (calendarService as any).publishRealtimeCalendarEvent('calendar.event.updated', fullDetails, 'updated');
    } catch (err: any) {
      console.error('[CalendarMeetingListener] Error publishing calendar update for meeting.ended:', err.message);
    }
  }
}

export const calendarMeetingListener = new CalendarMeetingListener();

// Auto-initialize listener
calendarMeetingListener.init();
