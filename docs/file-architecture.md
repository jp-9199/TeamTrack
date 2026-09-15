# TeamTrack File Architecture & Object Storage Integration (Phase 8C)

## 1. Overview & Core Invariants

TeamTrack enforces a strict separation between metadata storage and binary file payloads:

- **PostgreSQL**: The single source of truth for metadata, status lifecycles, and relational ownership. PostgreSQL **never** stores binary file bytes.
- **Object Storage (S3-Compatible)**: S3, Cloudflare R2, or MinIO stores raw binary payloads.
- **Express Backend**: The backend is the authorization and security boundary. It issues short-lived presigned URLs for direct client-to-storage operations and **never proxies binary file bytes**.

---

## 2. File Lifecycle State Machine

```
               POST /upload-intent
                     │
                     ▼
             ┌───────────────┐
             │   UPLOADING   │ (TTL: 900s / 15 mins)
             └───────┬───────┘
                     │
        ┌────────────┴────────────┐
        │                         │
(Verified headObject)      (Expired / Size mismatch)
        │                         │
        ▼                         ▼
 ┌─────────────┐           ┌─────────────┐
 │    READY    │           │   FAILED    │
 └──────┬──────┘           └─────────────┘
        │
(Soft Delete)
        │
        ▼
 ┌─────────────┐
 │   DELETED   │ (is_deleted = true, deleted_at = NOW())
 └─────────────┘
```

- **uploading**: Initial state created during upload intent. Upload must be completed within `UPLOAD_INTENT_TTL_SECONDS` (900 seconds).
- **ready**: Object was verified in storage by `FileService.finalizeUpload()` with matching size and content type. Only ready files can be downloaded or attached to messages.
- **failed**: Assigned if upload intent expired or object verification failed.
- **deleted**: Soft-deleted record in PostgreSQL (`is_deleted = true`). Blocked from future reads, downloads, or message attachments.

---

## 3. Canonical Storage Key Structure

Keys are generated exclusively server-side using the canonical format:

```
tenants/{organizationId}/files/{fileId}/{randomNonce}_{sanitizedBasename}
```

- `organizationId`: Enforces tenant partition isolation in object storage.
- `fileId`: Server-generated UUIDv4.
- `randomNonce`: 16-byte cryptographically secure random hexadecimal string (32 hex characters) to prevent predictability and collision.
- `sanitizedBasename`: Stripped of slashes, null bytes, traversal characters (`..`), and non-alphanumeric symbols.
- Clients never supply or influence the storage key, bucket, or driver.

---

## 4. API Endpoints & Request Flows

### 4.1 Create Upload Intent
`POST /api/v1/organizations/:organizationId/files/upload-intent`
- Authenticated user must have active membership in `:organizationId`.
- Validates filename, size (<= 100 MB), and MIME type.
- Generates presigned PUT URL via `StorageProvider` with 15-minute expiration (`UPLOAD_INTENT_TTL_SECONDS = 900`).
- Creates row in `files` table with `status = 'uploading'`.
- Returns `{ fileId, uploadUrl, expiresAt }`.

### 4.2 Finalize Upload
`POST /api/v1/files/:fileId/finalize`
- **CRITICAL PERMISSION**: **ONLY the uploader who originally created the upload intent may finalize it.** Organization admins and owners cannot finalize another user's upload.
- Calls `StorageProvider.headObject(storageKey)` to verify object existence and exact byte size against declared `file_size_bytes`.
- Uses row locking (`SELECT ... FOR UPDATE`) in PostgreSQL to eliminate concurrency races.
- Transitions status to `ready` and returns `FileMetadata`.

### 4.3 Get Signed Download URL
`GET /api/v1/files/:fileId/download-url`
- Authenticates caller and evaluates contextual authorization (see Section 5).
- File must not be soft-deleted and must have `status == 'ready'`.
- Generates ephemeral presigned GET URL with 10-minute expiration (`DOWNLOAD_URL_TTL_SECONDS = 600`).
- Enforces `Content-Disposition: attachment; filename="safe.ext"` to protect against browser execution of active content (HTML, SVG, XML).
- Download URLs are never persisted in the database.

### 4.4 Get File Metadata
`GET /api/v1/files/:fileId`
- Returns safe `FileMetadata` DTO.
- Does not expose `storage_key`, cloud credentials, or provider configuration.

### 4.5 Soft Delete File
`DELETE /api/v1/files/:fileId`
- Allowed for original uploader or organization owner/admin.
- **Database soft delete is authoritative**: marks `is_deleted = true` and `deleted_at = NOW()`.
- Attempts remote storage deletion via `StorageProvider.deleteObject(storageKey)`.
- If remote storage deletion fails, **the database row is not resurrected**. Physical object cleanup is decoupled for future reconciliation.

### 4.6 List Organization Files
`GET /api/v1/organizations/:organizationId/files`
- Authenticated organization members can list non-deleted, ready files.
- Uses keyset cursor pagination (`(created_at, id)`).
- Guests are restricted to files they uploaded or have access to via attached channels.

---

## 5. Authorization & Anti-IDOR Model

File access is never granted purely by knowing a file UUID. Access strictly follows resource context:

### Unattached Files
- **Uploader**: Has full read, download, finalize, and delete access.
- **Organization Owner / Admin**: Can read, list, and delete unattached files. Cannot finalize another user's uploading file.
- **Guests**: Can only access unattached files they personally uploaded.
- **Cross-Organization / Non-Members**: Return `404 FILE_NOT_FOUND` (anti-enumeration).

### Attached Files (Channel / Conversation)
- Once attached to a message, **file access strictly follows the target channel or conversation authorization**:
  - **Channel Message Attachment**: Requires channel read access. In private channels, non-members cannot read the file, **even if they were the original uploader**.
  - **Conversation Message Attachment**: Requires active membership in the conversation.
- This prevents access leakage when files are shared into confidential rooms.

---

## 6. Messaging Integration

`SendMessageRequest` accepts `attachmentFileIds: string[]`. Before creating the message:
1. Validates all IDs are valid UUIDs and `<= 10` attachments per message.
2. Deduplicates IDs safely.
3. Verifies each file exists, is not soft-deleted, belongs to the message's organization, and is in `'ready'` status.
4. Verifies the sender is authorized to use the file.
5. Links attachments in `message_attachments` within the message creation transaction.
6. Message queries return enriched attachment metadata (`fileName`, `fileSizeBytes`, `mimeType`, `createdAt`) without generating wasteful download URLs upfront.

---

## 7. Scope Boundaries & Future Phases

- **Out of Scope for Phase 8C**:
  - Frontend upload UI, drag & drop, file previews, and viewers.
  - Multipart / chunked streaming uploads.
  - Antivirus and deep content scanning.
  - Background cleanup / orphan reconciliation workers.
  - Direct binary proxying through Express.
