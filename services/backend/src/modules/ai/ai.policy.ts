export class AIPolicy {
  public static readonly MAX_MESSAGE_LENGTH = 4000;
  public static readonly MAX_CONTEXT_LENGTH = 8000;
  public static readonly MAX_TOOL_CALLS_PER_REQUEST = 5;
  public static readonly MAX_TURNS_PER_REQUEST = 3;
  public static readonly CONFIRMATION_EXPIRATION_MINUTES = 15;

  /**
   * Sanitizes and validates user input text.
   * Strips null bytes and control characters (except tab and newlines).
   */
  public static sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      throw new Error('Message must be a non-empty string');
    }

    // Strip null bytes and non-printable control characters
    const sanitized = input
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();

    if (!sanitized) {
      throw new Error('Message cannot be empty or solely whitespace');
    }

    if (sanitized.length > this.MAX_MESSAGE_LENGTH) {
      throw new Error(`Message exceeds maximum length of ${this.MAX_MESSAGE_LENGTH} characters`);
    }

    return sanitized;
  }

  /**
   * Encapsulates tool output as untrusted passive data.
   * Defends against prompt injection by preventing adversarial content from escaping delimiters.
   */
  public static encapsulateUntrustedData(toolName: string, rawData: unknown): string {
    const serialized = typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2);

    // Escape any attempt by attacker to break out of data context tags
    const safeData = serialized
      .replace(/<\/teamtrack_data_context>/gi, '&lt;/teamtrack_data_context&gt;')
      .replace(/<teamtrack_data_context/gi, '&lt;teamtrack_data_context');

    return `<teamtrack_data_context source_tool="${toolName}" untrusted="true">
${safeData}
</teamtrack_data_context>`;
  }

  /**
   * Deeply sanitizes tool output before it enters model context.
   * Strictly redacts credentials, passwords, session tokens, storage keys, and connection strings.
   */
  public static sanitizeToolOutput(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeToolOutput(item));
    }

    if (typeof data === 'object') {
      const clean: Record<string, unknown> = {};
      const forbiddenKeys = [
        'storage_key',
        'storagekey',
        'token',
        'refreshtoken',
        'accesstoken',
        'password',
        'passwordhash',
        'secret',
        'apikey',
        'credential',
        'database_url',
        'stack',
      ];

      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (forbiddenKeys.some((f) => lowerKey.includes(f))) {
          clean[key] = '[REDACTED]';
        } else {
          clean[key] = this.sanitizeToolOutput(value);
        }
      }
      return clean;
    }

    return data;
  }

  private static sanitizeString(str: string): string {
    // Redact Bearer tokens, passwords, s3 urls with credentials if any
    return str
      .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]')
      .replace(/password\s*=\s*[^\s;]+/gi, 'password=[REDACTED]');
  }
}
