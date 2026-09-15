export class StorageError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class ObjectNotFoundError extends StorageError {
  constructor(storageKey: string) {
    super('OBJECT_NOT_FOUND', `Object not found in storage: ${storageKey}`, 404);
    this.name = 'ObjectNotFoundError';
  }
}

export class InvalidStorageKeyError extends StorageError {
  constructor(message: string) {
    super('INVALID_STORAGE_KEY', message, 400);
    this.name = 'InvalidStorageKeyError';
  }
}

export class StorageUnavailableError extends StorageError {
  constructor(message: string = 'Storage service is temporarily unavailable') {
    super('STORAGE_UNAVAILABLE', message, 503);
    this.name = 'StorageUnavailableError';
  }
}

export class StorageSigningError extends StorageError {
  constructor(message: string) {
    super('STORAGE_SIGNING_FAILED', message, 500);
    this.name = 'StorageSigningError';
  }
}

export class InvalidStorageConfigError extends StorageError {
  constructor(message: string) {
    super('INVALID_STORAGE_CONFIG', message, 500);
    this.name = 'InvalidStorageConfigError';
  }
}
