import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config/index.js';
import {
  healthRouter,
  authRouter,
  organizationRouter,
  teamRouter,
  channelRouter,
  conversationRouter,
  messageRouter,
  meetingRouter,
  fileRouter,
  notificationRouter,
  devicesRouter,
  searchRouter,
  calendarRouter,
  aiRouter,
  userRouter,
  callsRouter,
  channelFilesRouter,
} from './routes/index.js';
import { webSocketServer } from './realtime/index.js';
import './modules/calendar/calendarMeeting.listener.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { registerShutdownHandlers } from './observability/shutdown.js';

export const app = express();

// ── Phase 14: Request Correlation ID (must be first) ──────────────────────────
app.use(requestIdMiddleware);

// Configure CORS with explicit allowed origins and credentials support
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (like curl, mobile native apps) with undefined origin
      if (!origin || config.cors.origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-client-platform', 'x-request-id', 'x-correlation-id'],
    exposedHeaders: ['X-Request-Id', 'X-Correlation-Id'],
  })
);

app.use(cookieParser());
// Phase 14: Enforce 1 MB body size limit on all request bodies
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Phase 14: Structured HTTP request logging ──────────────────────────────────
app.use(requestLogger);

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/organizations', organizationRouter);
app.use('/api/v1/teams', teamRouter);
app.use('/api/v1/channels', channelRouter);
app.use('/api/v1/conversations', conversationRouter);
app.use('/api/v1/messages', messageRouter);
app.use('/api/v1/meetings', meetingRouter);
app.use('/api/v1/files', fileRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/devices', devicesRouter);
app.use('/api/v1/search', searchRouter);
app.use('/api/v1/calendar', calendarRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/calls', callsRouter);
app.use('/api/v1/channels/:channelId/files', channelFilesRouter);

// Fallback aliases for root paths
app.use('/auth', authRouter);
app.use('/calls', callsRouter);

// ── Phase 14: Central structured error handler (must be last) ─────────────────
app.use(errorHandler);

const isTestRunner = process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'));

export const server = isTestRunner
  ? null
  : app.listen(config.port, () => {
      console.log(`[TeamTrack Backend] Service listening on port ${config.port} (${config.nodeEnv})`);
    });

if (server) {
  // Attach WebSocket server to HTTP server upgrade event
  webSocketServer.attach(server);

  // Phase 14: Register graceful shutdown handlers
  registerShutdownHandlers(server, config.shutdownTimeoutMs);
}

