import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { calendarController } from '../modules/calendar/calendar.controller.js';

export const calendarRouter = Router();

// All calendar endpoints require authentication
calendarRouter.use(requireAuth);

// Availability / Conflict Detection
calendarRouter.get('/availability', (req, res) => {
  calendarController.getAvailability(req, res);
});

calendarRouter.post('/availability', (req, res) => {
  calendarController.getAvailability(req, res);
});

// Event CRUD
calendarRouter.post('/events', (req, res) => {
  calendarController.createEvent(req, res);
});

calendarRouter.get('/events', (req, res) => {
  calendarController.listEvents(req, res);
});

calendarRouter.get('/events/:eventId', (req, res) => {
  calendarController.getEvent(req, res);
});

calendarRouter.patch('/events/:eventId', (req, res) => {
  calendarController.updateEvent(req, res);
});

calendarRouter.delete('/events/:eventId', (req, res) => {
  calendarController.deleteEvent(req, res);
});

// Attendee Response (RSVP)
calendarRouter.post('/events/:eventId/respond', (req, res) => {
  calendarController.respondToEvent(req, res);
});

// Attendee Management
calendarRouter.post('/events/:eventId/attendees', (req, res) => {
  calendarController.addAttendee(req, res);
});

calendarRouter.get('/events/:eventId/attendees', (req, res) => {
  calendarController.listAttendees(req, res);
});

calendarRouter.delete('/events/:eventId/attendees/:userId', (req, res) => {
  calendarController.removeAttendee(req, res);
});
