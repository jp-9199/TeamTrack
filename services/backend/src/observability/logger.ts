import { config } from '../config/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'cookies',
  'secret',
  'apikey',
  'api_key',
  'secretaccesskey',
  'accesskeyid',
  'confirmationtoken',
  'tokenhash',
  'credentials',
  'turncredential',
]);

export function redactSensitiveData(data: unknown, depth = 0): unknown {
  if (depth > 8) return '[DEPTH_LIMIT]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Check for Bearer token patterns
    if (data.toLowerCase().startsWith('bearer ')) {
      return 'Bearer [REDACTED]';
    }
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = redactSensitiveData(value, depth + 1);
    }
  }

  return sanitized;
}

export class Logger {
  private currentLevelPriority: number;

  constructor() {
    const configuredLevel = (config.logging.level.toLowerCase() as LogLevel) || 'info';
    this.currentLevelPriority = LOG_LEVEL_PRIORITY[configuredLevel] ?? LOG_LEVEL_PRIORITY.info;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= this.currentLevelPriority;
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const redactedMeta = meta ? (redactSensitiveData(meta) as Record<string, unknown>) : undefined;

    if (config.logging.format === 'json' || config.isProduction) {
      const payload: Record<string, unknown> = {
        timestamp,
        severity: level,
        service: 'backend',
        environment: config.nodeEnv,
        message,
      };

      if (redactedMeta) {
        Object.assign(payload, redactedMeta);
      }

      return JSON.stringify(payload);
    }

    // Text format for development/testing
    const metaStr = redactedMeta && Object.keys(redactedMeta).length > 0 ? ` ${JSON.stringify(redactedMeta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage('debug', message, meta));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    console.log(this.formatMessage('info', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatMessage('error', message, meta));
  }
}

export const logger = new Logger();
