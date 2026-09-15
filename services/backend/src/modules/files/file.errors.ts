import type { Phase8ErrorCode } from '@teamtrack/shared-types';

export class FileServiceError extends Error {
  constructor(
    public code: Phase8ErrorCode | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_FAILED' | 'MISSING_ORGANIZATION_ID',
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'FileServiceError';
    Object.setPrototypeOf(this, FileServiceError.prototype);
  }
}
