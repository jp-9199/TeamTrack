import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { messagingController } from '../modules/messaging/messaging.controller.js';

export const messageRouter = Router();

messageRouter.use(requireAuth);

messageRouter.get('/:messageId', (req, res) => {
  messagingController.getMessage(req, res);
});

messageRouter.patch('/:messageId', (req, res) => {
  messagingController.editMessage(req, res);
});

messageRouter.delete('/:messageId', (req, res) => {
  messagingController.deleteMessage(req, res);
});

messageRouter.post('/:messageId/reactions', (req, res) => {
  messagingController.addReaction(req, res);
});

messageRouter.delete('/:messageId/reactions/:reactionCode', (req, res) => {
  messagingController.removeReaction(req, res);
});
