import { Router } from 'express';
import { authController } from '../modules/auth/auth.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  registerRateLimiter,
  loginRateLimiter,
  refreshRateLimiter,
} from '../middleware/rateLimiter.js';
import { wsTicketService } from '../realtime/wsTicket.service.js';

export const authRouter = Router();

authRouter.post('/register', registerRateLimiter, (req, res) => {
  authController.register(req, res);
});

authRouter.post('/login', loginRateLimiter, (req, res) => {
  authController.login(req, res);
});

authRouter.post('/refresh', refreshRateLimiter, (req, res) => {
  authController.refresh(req, res);
});

authRouter.post('/logout', (req, res) => {
  authController.logout(req, res);
});

authRouter.get('/me', requireAuth, (req, res) => {
  authController.getCurrentUser(req, res);
});

authRouter.post('/ws-ticket', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const sessionId = (req as any).user.sessionId;
    const ticketData = await wsTicketService.createTicket(userId, sessionId);

    res.status(200).json({
      success: true,
      data: ticketData,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Auth ws-ticket error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to generate WebSocket ticket' },
      timestamp: new Date().toISOString(),
    });
  }
});

