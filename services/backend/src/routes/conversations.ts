import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { conversationController } from '../modules/conversations/conversation.controller.js';

export const conversationRouter = Router();

conversationRouter.use(requireAuth);

conversationRouter.post('/', (req, res) => {
  conversationController.createConversation(req, res);
});

conversationRouter.get('/', (req, res) => {
  conversationController.listConversations(req, res);
});

conversationRouter.get('/:conversationId', (req, res) => {
  conversationController.getConversation(req, res);
});

conversationRouter.post('/:conversationId/messages', (req, res) => {
  conversationController.sendMessage(req, res);
});

conversationRouter.get('/:conversationId/messages', (req, res) => {
  conversationController.listMessages(req, res);
});

conversationRouter.get('/:conversationId/sync', (req, res) => {
  conversationController.syncConversation(req, res);
});

conversationRouter.post('/:conversationId/read', (req, res) => {
  conversationController.markRead(req, res);
});
