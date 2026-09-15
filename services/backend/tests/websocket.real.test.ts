import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import WebSocket from 'ws';
import { app } from '../src/server.js';
import { webSocketServer } from '../src/realtime/websocket.server.js';
import { tokenService } from '../src/modules/auth/token.service.js';
import { wsTicketService } from '../src/realtime/wsTicket.service.js';
import { eventPublisher } from '../src/realtime/event.publisher.js';
import { config } from '../src/config/index.js';

describe('Real WebSocket Handshake & Network Verification (Local Runtime)', () => {
  let server: http.Server;
  let baseUrl: string;
  let wsUrl: string;
  let validToken: string;
  const testUserId = '00000000-0000-4000-8000-000000000001';
  const testSessionId = '00000000-0000-4000-8000-000000000002';

  before(async () => {
    // Dedicated HTTP server on ephemeral port 0 to prevent conflicts
    server = http.createServer(app);
    webSocketServer.attach(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number; address: string };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
        resolve();
      });
    });

    // Generate authenticated JWT for test user
    validToken = tokenService.signAccessToken({
      userId: testUserId,
      sessionId: testSessionId,
      email: 'realws@teamtrack.internal',
    });
  });

  after(async () => {
    webSocketServer.close();
    if ((server as any).closeAllConnections) {
      (server as any).closeAllConnections();
    }
    if ((server as any).closeIdleConnections) {
      (server as any).closeIdleConnections();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function connectWs(
    url: string,
    protocols?: string | string[]
  ): Promise<{ ws: WebSocket; opened: boolean; status?: number }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(url, protocols);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          resolve({ ws, opened: false, status: 408 });
        }
      }, 2000);
      timeout.unref();

      ws.on('open', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ ws, opened: true });
        }
      });

      ws.on('unexpected-response', (req, res) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ ws, opened: false, status: res.statusCode });
        }
      });

      ws.on('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ ws, opened: false, status: 500 });
        }
      });
    });
  }

  it('verifies complete WebSocket authentication lifecycle: POST /api/v1/auth/ws-ticket -> connect -> handshake -> ping/pong', async () => {
    // 1. Request ticket via real HTTP POST
    const ticketRes = await fetch(`${baseUrl}/api/v1/auth/ws-ticket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
        Connection: 'close',
      },
    });

    assert.strictEqual(ticketRes.status, 200);
    const body = (await ticketRes.json()) as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(typeof body.data.ticket, 'string');
    assert.strictEqual(body.data.expiresInSeconds, 30);
    assert(body.data.ticket.length >= 40, 'Ticket must have 32 bytes entropy');

    const ticket = body.data.ticket;

    // 2. Open real WebSocket offering: Sec-WebSocket-Protocol: teamtrack-ws, tt-ticket.<ticket>
    const { ws, opened } = await connectWs(wsUrl, ['teamtrack-ws', `tt-ticket.${ticket}`]);
    assert.strictEqual(opened, true, 'WebSocket connection must succeed');
    assert.strictEqual(ws.protocol, 'teamtrack-ws', 'Server must accept teamtrack-ws and not echo ticket');
    assert.strictEqual(ws.readyState, WebSocket.OPEN);

    // 3. Send real ping JSON frame and receive pong
    const pongReceived = new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'pong') {
          resolve();
        }
      });
    });

    ws.send(JSON.stringify({ type: 'ping' }));
    await pongReceived;

    // 4. Close socket
    ws.close();

    // 5. Attempt second connection using the SAME ticket (must be rejected as single-use)
    const secondAttempt = await connectWs(wsUrl, ['teamtrack-ws', `tt-ticket.${ticket}`]);
    assert.strictEqual(secondAttempt.opened, false);
    assert.strictEqual(secondAttempt.status, 401, 'Reused ticket must be rejected with 401');
    secondAttempt.ws.close();
  });

  it('rejects connection attempts with credentials in query string', async () => {
    // 1. Query-string token
    const tokenAttempt = await connectWs(`${wsUrl}?token=secret-token`, ['teamtrack-ws']);
    assert.strictEqual(tokenAttempt.opened, false);
    assert.strictEqual(tokenAttempt.status, 400, 'Query-string token must return 400 Bad Request');
    tokenAttempt.ws.close();

    // 2. Query-string ticket
    const ticketAttempt = await connectWs(`${wsUrl}?ticket=secret-ticket`, ['teamtrack-ws']);
    assert.strictEqual(ticketAttempt.opened, false);
    assert.strictEqual(ticketAttempt.status, 400, 'Query-string ticket must return 400 Bad Request');
    ticketAttempt.ws.close();
  });

  it('rejects connection without ticket subprotocol', async () => {
    const attempt = await connectWs(wsUrl, ['teamtrack-ws']);
    assert.strictEqual(attempt.opened, false);
    assert.strictEqual(attempt.status, 401, 'Missing ticket must return 401 Unauthorized');
    attempt.ws.close();
  });

  it('rejects connection with malformed ticket', async () => {
    const attempt = await connectWs(wsUrl, ['teamtrack-ws', 'tt-ticket.bogus-invalid-ticket-value']);
    assert.strictEqual(attempt.opened, false);
    assert.strictEqual(attempt.status, 401, 'Malformed ticket must return 401 Unauthorized');
    attempt.ws.close();
  });

  it('rejects connection with invalid subprotocol (missing teamtrack-ws)', async () => {
    // Generate valid ticket
    const ticketData = await wsTicketService.createTicket(testUserId, testSessionId);

    // Offer wrong subprotocol without teamtrack-ws
    const attempt = await connectWs(wsUrl, ['unsupported-proto', `tt-ticket.${ticketData.ticket}`]);
    assert.strictEqual(attempt.opened, false);
    assert.strictEqual(attempt.status, 400, 'Invalid subprotocol must return 400 Bad Request');
    attempt.ws.close();
  });

  it('verifies production configuration does not allow silent in-memory fallback for realtime services', async () => {
    const originalIsProduction = config.isProduction;

    try {
      // Force production mode to verify strict invariant
      (config as any).isProduction = true;

      // 1. wsTicketService.createTicket must throw when Redis is null
      await assert.rejects(
        async () => {
          await wsTicketService.createTicket('user-test', 'sess-test');
        },
        /REDIS_UNAVAILABLE/,
        'Production must strictly reject in-memory ticket creation when Redis is unavailable'
      );

      // 2. wsTicketService.consumeTicket must return null when Redis is null
      const consumed = await wsTicketService.consumeTicket('any-ticket');
      assert.strictEqual(consumed, null, 'Production must never fall back to memory ticket consumption');

      // 3. eventPublisher.publish must throw when Redis is null
      await assert.rejects(
        async () => {
          await eventPublisher.publish('message.created', 'channel:test', { msg: 'test' });
        },
        /REDIS_UNAVAILABLE/,
        'Production must strictly reject in-memory event broadcast when Redis is unavailable'
      );
    } finally {
      (config as any).isProduction = originalIsProduction;
    }
  });
});
