import { InvalidStorageKeyError } from './storage.errors.js';

const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f]/;
const TRAVERSAL_REGEX = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
const WINDOWS_DRIVE_REGEX = /^[a-zA-Z]:[\\/]/;

/**
 * Validates that a storage key is safe for object storage operations.
 * Defensively prevents path traversal, absolute filesystem roots, null bytes,
 * and control characters without altering the key's identity.
 */
export function validateStorageKey(key: unknown): string {
  if (typeof key !== 'string') {
    throw new InvalidStorageKeyError('Storage key must be a string');
  }

  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new InvalidStorageKeyError('Storage key cannot be empty');
  }

  if (trimmed.length > 1024) {
    throw new InvalidStorageKeyError('Storage key exceeds maximum length of 1024 characters');
  }

  if (trimmed.includes('\0') || trimmed.includes('\u0000') || CONTROL_CHARS_REGEX.test(trimmed)) {
    throw new InvalidStorageKeyError('Storage key contains invalid control characters or null bytes');
  }

  if (TRAVERSAL_REGEX.test(trimmed) || trimmed.includes('..')) {
    throw new InvalidStorageKeyError('Storage key contains path traversal characters');
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || WINDOWS_DRIVE_REGEX.test(trimmed)) {
    throw new InvalidStorageKeyError('Storage key cannot be an absolute path');
  }

  return trimmed;
}
