import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import type { AuthorizedRequest } from '../modules/authorization/authorization.middleware.js';
import { callRepository } from '../db/repositories/call.repository.js';
import { presenceService } from '../realtime/presence.service.js';

export const callsRouter = Router();

callsRouter.use(requireAuth);

// GET /api/v1/calls
callsRouter.get('/', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    const filter = req.query.filter as any;
    const calls = await callRepository.listUserCalls(userId, filter);
    res.json({ success: true, data: { calls } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/calls
callsRouter.post('/', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    const { callerName, calleeId, calleeName, callType, direction, status, durationSeconds } = req.body;
    const call = await callRepository.createCallRecord({
      callerId: userId,
      callerName: callerName || (req.user as any)?.displayName || req.user?.email?.split('@')[0] || 'You',
      calleeId: calleeId || 'unknown',
      calleeName: calleeName || 'Contact',
      callType: callType || 'audio',
      direction: direction || 'outgoing',
      status: status || 'completed',
      durationSeconds: Number(durationSeconds) || 0,
    });
    res.status(201).json({ success: true, data: { call } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/v1/calls/speed-dial
callsRouter.get('/speed-dial', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    const contacts = await callRepository.listSpeedDial(userId);
    res.json({ success: true, data: { contacts } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/calls/speed-dial
callsRouter.post('/speed-dial', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    const { contactUserId, displayName, email, role } = req.body;
    if (!contactUserId || !displayName) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Missing required contact info' } });
      return;
    }
    const contact = await callRepository.addSpeedDial(userId, {
      contactUserId,
      displayName,
      email: email || '',
      role: role || 'Colleague',
    });
    res.status(201).json({ success: true, data: { contact } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/calls/speed-dial/:contactId
callsRouter.delete('/speed-dial/:contactId', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    await callRepository.removeSpeedDial(userId, req.params.contactId);
    res.json({ success: true, data: { removed: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/v1/calls/presence/:userId
callsRouter.get('/presence/:userId', async (req: AuthorizedRequest, res) => {
  try {
    const pres = await presenceService.getUserPresence(req.params.userId);
    res.json({ success: true, data: pres });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/calls/presence
callsRouter.post('/presence', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    const { status, statusMessage, organizationId } = req.body;
    const pres = await presenceService.setUserPresence(userId, status, statusMessage, organizationId);
    res.json({ success: true, data: pres });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── People / Contacts Endpoints ──

// GET /api/v1/calls/contacts
callsRouter.get('/contacts', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    const filter = req.query.filter as any;
    const contacts = await callRepository.listContacts(userId, filter);
    res.json({ success: true, data: { contacts } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/calls/contacts
callsRouter.post('/contacts', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    const { name, email, phone } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Contact name is required' } });
      return;
    }
    const contact = await callRepository.addContact(userId, { name, email, phone });
    res.status(201).json({ success: true, data: { contact } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/calls/contacts/:id
callsRouter.delete('/contacts/:id', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id || 'self';
    await callRepository.deleteContact(userId, req.params.id);
    res.json({ success: true, data: { removed: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/calls/contacts/invite
callsRouter.post('/contacts/invite', async (req: AuthorizedRequest, res) => {
  try {
    const { contactId, email, phone } = req.body;
    const inviteUrl = `${req.protocol}://${req.get('host')}/invite?token=${crypto.randomUUID()}`;
    res.json({
      success: true,
      data: {
        invited: true,
        inviteUrl,
        message: 'Invitation link generated successfully',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
