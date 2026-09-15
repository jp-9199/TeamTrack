import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { channelController } from '../modules/channels/channel.controller.js';
import { messagingController } from '../modules/messaging/messaging.controller.js';
import { notificationPreferencesController } from '../modules/notifications/notification-preferences.controller.js';

export const channelRouter = Router();

// All channel endpoints require authenticated session
channelRouter.use(requireAuth);

channelRouter.get('/:channelId', (req, res) => {
  channelController.getChannel(req, res);
});

channelRouter.patch('/:channelId', (req, res) => {
  channelController.updateChannel(req, res);
});

channelRouter.post('/:channelId/archive', (req, res) => {
  channelController.archiveChannel(req, res);
});

// Private Channel Members
channelRouter.get('/:channelId/members', (req, res) => {
  channelController.listChannelMembers(req, res);
});

channelRouter.post('/:channelId/members', (req, res) => {
  channelController.addChannelMember(req, res);
});

channelRouter.delete('/:channelId/members/:userId', (req, res) => {
  channelController.removeChannelMember(req, res);
});

// Channel Messaging & Synchronization
channelRouter.post('/:channelId/messages', (req, res) => {
  messagingController.sendChannelMessage(req, res);
});

channelRouter.get('/:channelId/messages', (req, res) => {
  messagingController.listChannelMessages(req, res);
});

channelRouter.get('/:channelId/sync', (req, res) => {
  messagingController.syncChannel(req, res);
});

channelRouter.post('/:channelId/read', (req, res) => {
  messagingController.markChannelRead(req, res);
});

// Phase 9D-A: Channel Notification Mute
channelRouter.get('/:channelId/notification-mute', (req, res) => {
  notificationPreferencesController.getChannelMute(req, res);
});

channelRouter.put('/:channelId/notification-mute', (req, res) => {
  notificationPreferencesController.muteChannel(req, res);
});

channelRouter.delete('/:channelId/notification-mute', (req, res) => {
  notificationPreferencesController.unmuteChannel(req, res);
});
