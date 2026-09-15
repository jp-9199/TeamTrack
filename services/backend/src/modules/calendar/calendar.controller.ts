import type { Request, Response } from 'express';
import {
  validateCreateCalendarEventRequest,
  validateUpdateCalendarEventRequest,
  validateCalendarEventQuery,
  validateCalendarRespondRequest,
  validateAddCalendarAttendeeRequest,
  validateCalendarAvailabilityRequest,
  validateUUID,
} from '@teamtrack/validation';
import { calendarService, CalendarServiceError } from './calendar.service.js';

export class CalendarController {
  private getCallerId(req: Request): string | null {
    return (req as any).user?.id || (req as any).user?.userId || null;
  }

  async createEvent(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const validation = validateCreateCalendarEventRequest(req.body);
    if (!validation.isValid) {
      res.status(400).json({ success: false, error: validation.errors[0] });
      return;
    }

    try {
      const result = await calendarService.createEvent(callerId, validation.data);
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getEvent(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const idRes = validateUUID(req.params.eventId, 'eventId');
    if (!idRes.isValid) {
      res.status(400).json({ success: false, error: idRes.errors[0] });
      return;
    }

    try {
      const result = await calendarService.getEvent(callerId, idRes.data!);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async updateEvent(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const idRes = validateUUID(req.params.eventId, 'eventId');
    if (!idRes.isValid) {
      res.status(400).json({ success: false, error: idRes.errors[0] });
      return;
    }

    const validation = validateUpdateCalendarEventRequest(req.body);
    if (!validation.isValid) {
      res.status(400).json({ success: false, error: validation.errors[0] });
      return;
    }

    try {
      const result = await calendarService.updateEvent(callerId, idRes.data!, validation.data);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async deleteEvent(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const idRes = validateUUID(req.params.eventId, 'eventId');
    if (!idRes.isValid) {
      res.status(400).json({ success: false, error: idRes.errors[0] });
      return;
    }

    try {
      await calendarService.deleteEvent(callerId, idRes.data!);
      res.status(200).json({ success: true, data: null });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async respondToEvent(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const idRes = validateUUID(req.params.eventId, 'eventId');
    if (!idRes.isValid) {
      res.status(400).json({ success: false, error: idRes.errors[0] });
      return;
    }

    const validation = validateCalendarRespondRequest(req.body);
    if (!validation.isValid) {
      res.status(400).json({ success: false, error: validation.errors[0] });
      return;
    }

    try {
      const result = await calendarService.respondToEvent(callerId, idRes.data!, validation.data);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async addAttendee(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const idRes = validateUUID(req.params.eventId, 'eventId');
    if (!idRes.isValid) {
      res.status(400).json({ success: false, error: idRes.errors[0] });
      return;
    }

    const validation = validateAddCalendarAttendeeRequest(req.body);
    if (!validation.isValid) {
      res.status(400).json({ success: false, error: validation.errors[0] });
      return;
    }

    try {
      const result = await calendarService.addAttendee(callerId, idRes.data!, validation.data);
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async removeAttendee(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const eventIdRes = validateUUID(req.params.eventId, 'eventId');
    if (!eventIdRes.isValid) {
      res.status(400).json({ success: false, error: eventIdRes.errors[0] });
      return;
    }

    const userIdRes = validateUUID(req.params.userId, 'userId');
    if (!userIdRes.isValid) {
      res.status(400).json({ success: false, error: userIdRes.errors[0] });
      return;
    }

    try {
      await calendarService.removeAttendee(callerId, eventIdRes.data!, userIdRes.data!);
      res.status(200).json({ success: true, data: null });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listAttendees(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const idRes = validateUUID(req.params.eventId, 'eventId');
    if (!idRes.isValid) {
      res.status(400).json({ success: false, error: idRes.errors[0] });
      return;
    }

    try {
      const result = await calendarService.listAttendees(callerId, idRes.data!);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async listEvents(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const validation = validateCalendarEventQuery(req.query);
    if (!validation.isValid) {
      res.status(400).json({ success: false, error: validation.errors[0] });
      return;
    }

    try {
      const result = await calendarService.listEvents(callerId, validation.data);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  async getAvailability(req: Request, res: Response): Promise<void> {
    const callerId = this.getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    // Support either GET query parameters or POST request body
    const params = req.method === 'POST' ? req.body : {
      ...req.query,
      userIds: typeof req.query.userIds === 'string'
        ? req.query.userIds.split(',').map((s) => s.trim())
        : req.query.userIds,
    };

    const validation = validateCalendarAvailabilityRequest(params);
    if (!validation.isValid) {
      res.status(400).json({ success: false, error: validation.errors[0] });
      return;
    }

    try {
      const result = await calendarService.getAvailability(callerId, validation.data);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      this.handleError(res, err);
    }
  }

  private handleError(res: Response, err: any): void {
    if (err instanceof CalendarServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
      return;
    }

    console.error('[CalendarController] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred',
      },
    });
  }
}

export const calendarController = new CalendarController();
