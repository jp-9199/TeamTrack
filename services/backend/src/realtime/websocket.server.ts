import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import crypto from 'crypto';
import WebSocket, { Server as WebSocketServer } from 'ws';
import { wsTicketService, type WsTicketPayload } from './wsTicket.service.js';
import { subscriptionManager, type AuthenticatedSocket } from './subscription.manager.js';
import { eventSubscriber } from './event.subscriber.js';
import { webRtcSignalingService } from './webrtc.signaling.js';

const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB maximum frame size

export class TeamTrackWebSocketServer {
  private wss: WebSocketServer;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PAYLOAD_BYTES,
      handleProtocols: (protocols) => {
        // Return only the accepted application protocol; never echo the ticket
        const hasProtocol = Array.isArray(protocols)
          ? protocols.includes('teamtrack-ws')
          : protocols && typeof (protocols as any).has === 'function'
            ? (protocols as any).has('teamtrack-ws')
            : false;
        return hasProtocol ? 'teamtrack-ws' : false;
      },
    });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage, authData: WsTicketPayload) => {
      this.handleConnection(ws, authData);
    });

    // Start Redis subscriber for cross-instance fan-out
    eventSubscriber.init();

    // Start heartbeat interval
    this.startHeartbeat();
  }

  attach(server: HttpServer): void {
    server.on('upgrade', async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);

      // WebSocket paths supported: /ws and /api/v1/ws
      if (url.pathname !== '/ws' && url.pathname !== '/api/v1/ws') {
        socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }

      // Security requirement: reject query-string credential attempts
      if (
        url.searchParams.has('token') ||
        url.searchParams.has('ticket') ||
        url.searchParams.has('access_token') ||
        url.searchParams.has('refresh_token')
      ) {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }

      // Parse Sec-WebSocket-Protocol for ticket
      const protocolHeader = request.headers['sec-websocket-protocol'] || '';
      const protocols = (typeof protocolHeader === 'string' ? protocolHeader : protocolHeader[0] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (!protocols.includes('teamtrack-ws')) {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }

      let ticket: string | null = null;
      for (const p of protocols) {
        if (p.startsWith('tt-ticket.')) {
          ticket = p.substring('tt-ticket.'.length);
          break;
        }
      }

      if (!ticket) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }

      // Atomically consume ticket
      const authData = await wsTicketService.consumeTicket(ticket);
      if (!authData) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }

      // Complete HTTP upgrade handshake
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request, authData);
      });
    });
  }

  private handleConnection(ws: WebSocket, authData: WsTicketPayload): void {
    const socketId = crypto.randomUUID();

    const authSocket: AuthenticatedSocket = {
      id: socketId,
      userId: authData.userId,
      sessionId: authData.sessionId,
      isAlive: true,
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      },
      close: (code?: number, reason?: string) => {
        ws.close(code, reason);
      },
    };

    // Register socket for user-level tracking (multi-device support)
    subscriptionManager.registerSocket(authSocket);

    // Automatically subscribe the socket to its own user topic for direct signals
    subscriptionManager.subscribe(authSocket, `user:${authData.userId}`).catch((err) => {
      console.error('[WebSocket] Auto-subscribe user topic error:', err.message);
    });

    // Heartbeat ping/pong tracking
    ws.on('pong', () => {
      authSocket.isAlive = true;
    });

    // Handle incoming client frames safely
    ws.on('message', async (data: any, isBinary: boolean) => {
      if (isBinary) {
        ws.send(JSON.stringify({ type: 'error', code: 'BINARY_FRAMES_NOT_SUPPORTED' }));
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(data.toString('utf8'));
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'MALFORMED_JSON' }));
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_PAYLOAD' }));
        return;
      }

      switch (parsed.type) {
        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        case 'subscribe': {
          if (typeof parsed.topic !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_TOPIC' }));
            return;
          }
          const res = await subscriptionManager.subscribe(authSocket, parsed.topic);
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'error', topic: parsed.topic, code: res.error }));
          }
          break;
        }

        case 'unsubscribe': {
          if (typeof parsed.topic !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_TOPIC' }));
            return;
          }
          subscriptionManager.unsubscribe(authSocket, parsed.topic);
          break;
        }

        // WebRTC Signaling: offer, answer, ice_candidate, renegotiate
        case 'webrtc.offer':
        case 'webrtc.answer':
        case 'webrtc.ice_candidate':
        case 'webrtc.renegotiate': {
          const res = await webRtcSignalingService.handleSignaling(authSocket, parsed.type, parsed);
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'error', code: res.error || 'SIGNALING_FAILED' }));
          }
          break;
        }

        case 'webrtc.signal': {
          const rawSignalType = parsed.signalType || `webrtc.${parsed.signal?.type}`;
          const res = await webRtcSignalingService.handleSignaling(authSocket, rawSignalType, {
            meetingId: parsed.meetingId,
            targetUserId: parsed.targetUserId,
            data: parsed.signal?.data ?? parsed.data ?? parsed.payload,
          });
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'error', code: res.error || 'SIGNALING_FAILED' }));
          }
          break;
        }

        // Transient meeting reaction
        case 'meeting.reaction': {
          const res = await webRtcSignalingService.handleReaction(authSocket, parsed);
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'error', code: res.error || 'REACTION_FAILED' }));
          }
          break;
        }

        // Hand state management
        case 'meeting.raise_hand':
        case 'meeting.hand_raised': {
          const res = await webRtcSignalingService.handleHandState(authSocket, parsed.meetingId, true);
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'error', code: res.error || 'HAND_STATE_FAILED' }));
          }
          break;
        }

        case 'meeting.lower_hand':
        case 'meeting.hand_lowered': {
          const res = await webRtcSignalingService.handleHandState(authSocket, parsed.meetingId, false);
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'error', code: res.error || 'HAND_STATE_FAILED' }));
          }
          break;
        }

        default: {
          ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_MESSAGE_TYPE' }));
          break;
        }
      }
    });

    // Cleanup on disconnect or error
    ws.on('close', () => {
      subscriptionManager.removeSocket(authSocket);
    });

    ws.on('error', (err) => {
      subscriptionManager.removeSocket(authSocket);
    });

    // Send initial connection acknowledgment with authenticated identity
    ws.send(
      JSON.stringify({
        type: 'authenticated',
        userId: authData.userId,
        sessionId: authData.sessionId,
      })
    );
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const ws of this.wss.clients) {
        const authWs = ws as any;
        if (authWs.isAlive === false) {
          ws.terminate();
          continue;
        }

        authWs.isAlive = false;
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.heartbeatTimer.unref();
  }

  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.wss.close();
  }
}

export const webSocketServer = new TeamTrackWebSocketServer();
