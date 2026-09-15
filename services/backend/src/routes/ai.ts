import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { aiRateLimiter } from '../middleware/aiRateLimiter.js';
import { aiController } from '../modules/ai/ai.controller.js';

export const aiRouter = Router();

// All AI endpoints require authenticated session and rate limiting
aiRouter.use(requireAuth);
aiRouter.use(aiRateLimiter);

// 1. Chat Turn
aiRouter.post('/chat', (req, res) => {
  aiController.chat(req, res);
});

// 2. AI Conversations
aiRouter.get('/conversations', (req, res) => {
  aiController.listConversations(req, res);
});

aiRouter.get('/conversations/:conversationId', (req, res) => {
  aiController.getConversation(req, res);
});

aiRouter.delete('/conversations/:conversationId', (req, res) => {
  aiController.deleteConversation(req, res);
});

// 3. Action Proposal Confirmation & Cancellation
aiRouter.post('/actions/:actionId/confirm', (req, res) => {
  aiController.confirmAction(req, res);
});

aiRouter.post('/actions/:actionId/cancel', (req, res) => {
  aiController.cancelAction(req, res);
});
