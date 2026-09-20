import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { presenceService } from '../src/realtime/presence.service.js';
import { callSignalingService } from '../src/realtime/callSignaling.service.js';
import { callRepository } from '../src/db/repositories/call.repository.js';
import type { AuthenticatedSocket } from '../src/realtime/subscription.manager.js';
import { app } from '../src/server.js';

describe('Presence Service & Real-Time Extensions', () => {
  test('normalizes arbitrary presence strings properly', () => {
    assert.equal(presenceService.normalizeStatus('Available'), 'available');
    assert.equal(presenceService.normalizeStatus('BUSY'), 'busy');
    assert.equal(presenceService.normalizeStatus('in_meeting'), 'busy');
    assert.equal(presenceService.normalizeStatus('do-not-disturb'), 'do_not_disturb');
    assert.equal(presenceService.normalizeStatus('dnd'), 'do_not_disturb');
    assert.equal(presenceService.normalizeStatus('Away'), 'away');
    assert.equal(presenceService.normalizeStatus('offline'), 'offline');
    assert.equal(presenceService.normalizeStatus('unknown-status'), 'available');
  });

  test('sets and gets user presence state correctly', async () => {
    const userId = 'user-test-presence-1';
    const pres = await presenceService.setUserPresence(userId, 'busy', 'In a design review');
    assert.equal(pres.userId, userId);
    assert.equal(pres.status, 'busy');
    assert.equal(pres.statusMessage, 'In a design review');

    const retrieved = await presenceService.getUserPresence(userId);
    assert.equal(retrieved.status, 'busy');
    assert.equal(retrieved.statusMessage, 'In a design review');
  });

  test('batch gets presence for multiple users', async () => {
    await presenceService.setUserPresence('u-a', 'available');
    await presenceService.setUserPresence('u-b', 'away');

    const batch = await presenceService.batchGetPresence(['u-a', 'u-b']);
    assert.equal(batch['u-a'].status, 'available');
    assert.equal(batch['u-b'].status, 'away');
  });
});

describe('Call Signaling Service', () => {
  const mockSocket: AuthenticatedSocket = {
    id: 'sock-1',
    userId: 'user-caller-1',
    sessionId: 'sess-1',
    isAlive: true,
    send: () => {},
    close: () => {},
  };

  test('prevents calling oneself', async () => {
    const res = await callSignalingService.handleCallInvite(mockSocket, {
      callId: 'c-1',
      targetUserId: 'user-caller-1',
    });
    assert.equal(res.success, false);
    assert.equal(res.error, 'CANNOT_CALL_SELF');
  });

  test('handles call invitation, acceptance, and end cycle', async () => {
    const inviteRes = await callSignalingService.handleCallInvite(mockSocket, {
      callId: 'call-xyz-100',
      targetUserId: 'user-callee-2',
      callType: 'video',
      callerName: 'Alice',
    });
    assert.equal(inviteRes.success, true);

    const calleeSocket: AuthenticatedSocket = {
      id: 'sock-2',
      userId: 'user-callee-2',
      sessionId: 'sess-2',
      isAlive: true,
      send: () => {},
      close: () => {},
    };

    const acceptRes = await callSignalingService.handleCallAccept(calleeSocket, {
      callId: 'call-xyz-100',
      callerUserId: 'user-caller-1',
    });
    assert.equal(acceptRes.success, true);

    const endRes = await callSignalingService.handleCallEnd(mockSocket, {
      callId: 'call-xyz-100',
      targetUserId: 'user-callee-2',
      durationSeconds: 45,
    });
    assert.equal(endRes.success, true);
  });
});

describe('Call Repository & Logs', () => {
  test('creates and retrieves call logs with direction and status filters', async () => {
    const callerId = 'user-call-filter-1';
    await callRepository.createCallRecord({
      callerId,
      callerName: 'Alice',
      calleeId: 'target-1',
      calleeName: 'Bob',
      callType: 'audio',
      direction: 'incoming',
      status: 'completed',
      durationSeconds: 120,
    });

    await callRepository.createCallRecord({
      callerId,
      callerName: 'Alice',
      calleeId: 'target-2',
      calleeName: 'Charlie',
      callType: 'video',
      direction: 'missed',
      status: 'missed',
      durationSeconds: 0,
    });

    const allCalls = await callRepository.listUserCalls(callerId);
    assert.ok(allCalls.length >= 2);

    const missedCalls = await callRepository.listUserCalls(callerId, 'missed');
    assert.ok(missedCalls.every((c) => c.direction === 'missed' || c.status === 'missed'));
  });

  test('manages speed dial contacts and enriches with presence', async () => {
    await callRepository.addSpeedDial('default', {
      name: 'Bob Test',
      email: 'bob@test.com',
      contactUserId: 'user-speeddial-bob',
    });
    const contacts = await callRepository.listSpeedDial('default');
    assert.ok(Array.isArray(contacts));
    assert.ok(contacts.length > 0);
    assert.ok(contacts[0].presence !== undefined);
  });
});
