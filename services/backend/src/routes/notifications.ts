import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { notificationController } from '../modules/notifications/notification.controller.js';
import { notificationPreferencesController } from '../modules/notifications/notification-preferences.controller.js';

export const notificationRouter = Router();

// All notification routes require authenticated session
notificationRouter.use(requireAuth);

// Keyset Paginated Inboxes & Unread Count
notificationRouter.get('/', (req, res) => {
  notificationController.listNotifications(req, res);
});

notificationRouter.get('/unread', (req, res) => {
  notificationController.listUnreadNotifications(req, res);
});

notificationRouter.get('/unread-count', (req, res) => {
  notificationController.getUnreadCount(req, res);
});

// Sequence-Bounded Catch-up Delta Synchronization
notificationRouter.get('/sync', (req, res) => {
  notificationController.syncNotifications(req, res);
});

// Phase 9D-A: Notification Preferences & Type Overrides
// Note: Must be defined before /:notificationId to avoid route parameter collision
notificationRouter.get('/preferences', (req, res) => {
  notificationPreferencesController.getPreferences(req, res);
});

notificationRouter.patch('/preferences', (req, res) => {
  notificationPreferencesController.updatePreferences(req, res);
});

notificationRouter.get('/preferences/types', (req, res) => {
  notificationPreferencesController.getTypePreferences(req, res);
});

notificationRouter.patch('/preferences/types/:notificationType', (req, res) => {
  notificationPreferencesController.updateTypePreference(req, res);
});

// Single Notification Lookup
notificationRouter.get('/:notificationId', (req, res) => {
  notificationController.getNotification(req, res);
});

// Read State Transitions
notificationRouter.post('/:notificationId/read', (req, res) => {
  notificationController.markRead(req, res);
});

notificationRouter.post('/:notificationId/unread', (req, res) => {
  notificationController.markUnread(req, res);
});

notificationRouter.post('/read-all', (req, res) => {
  notificationController.markAllRead(req, res);
});

// Soft Deletion
notificationRouter.delete('/:notificationId', (req, res) => {
  notificationController.deleteNotification(req, res);
});
