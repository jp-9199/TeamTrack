# TeamTrack Storage Architecture (Phase 8B)

## 1. Overview & Golden Architectural Rules

The TeamTrack Object Storage layer abstracts binary media storage away from the application and database tiers.

```
ONE backend
ONE PostgreSQL source of truth (metadata only)
ZERO binary media bytes stored in PostgreSQL
ZERO binary file bytes proxied through Express REST or WebSockets
S3-compatible Object Storage for all binary byte streams
Direct-to-Storage presigned URLs for all uploads and downloads
Server-side authorization before issuing presigned URLs
```

> [!NOTE]
> **Phase 8B Boundary**: This phase implements the foundational `StorageProvider` abstraction, `S3StorageProvider` (AWS S3, Cloudflare R2, MinIO), and `MockStorageProvider`. It does **not** implement file business logic, upload endpoints, or message attachment authorization, which belong to Phase 8C/8D.

---

## 2. StorageProvider Abstraction

Application business logic depends strictly on the `StorageProvider` interface ([`services/backend/src/storage/storage.types.ts`](file:///c:/Users/anime/.gemini/antigravity-ide/scratch/TeamTrack/services/backend/src/storage/storage.types.ts)), completely decoupled from AWS SDK classes or vendor-specific command implementations:

```typescript
export interface StorageProvider {
  readonly driver: 's3' | 'mock';

  getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds?: number,
    contentLength?: number
  ): Promise<SignedUploadUrlResult>;

  getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds?: number,
    downloadFilename?: string
  ): Promise<string>;

  headObject(storageKey: string): Promise<StorageObjectMetadata | null>;
  deleteObject(storageKey: string): Promise<void>;
  deleteObjects(storageKeys: string[]): Promise<void>;
}
```

---

## 3. Supported Storage Providers

### A. S3-Compatible Providers (`S3StorageProvider`)
Built using official `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` packages:
- **AWS S3**: Standard AWS virtual-host style addressing.
- **Cloudflare R2**: Custom endpoint (`https://<account_id>.r2.cloudflarestorage.com`) with S3 compatibility.
- **MinIO**: Custom endpoint (`http://localhost:9000`) with `s3ForcePathStyle: true`.

### B. Mock Storage Provider (`MockStorageProvider`)
In-memory implementation for test suites and offline development. Uses synthetic deterministic mock URLs (`mock-s3://teamtrack-mock-bucket/<key>`) and provides in-memory object inspection (`putMockObject`, `hasMockObject`, `clear`).

---

## 4. Environment Variables & Configuration

Configured in `BackendConfig.storage` ([`services/backend/src/config/index.ts`](file:///c:/Users/anime/.gemini/antigravity-ide/scratch/TeamTrack/services/backend/src/config/index.ts)):

| Environment Variable | Required For | Description / Example |
| :--- | :--- | :--- |
| `STORAGE_DRIVER` | All | `'s3'` or `'mock'`. (Production must be `'s3'`). |
| `S3_BUCKET` | S3 driver | Bucket name (e.g. `teamtrack-uploads`). |
| `S3_REGION` | S3 driver | AWS/R2 Region (defaults to `us-east-1`). |
| `S3_ENDPOINT` | R2 / MinIO | Custom service endpoint (e.g. `http://127.0.0.1:9000`). |
| `S3_ACCESS_KEY_ID` | S3 driver | Object storage access key ID. |
| `S3_SECRET_ACCESS_KEY`| S3 driver | Object storage secret access key. |
| `S3_FORCE_PATH_STYLE` | MinIO | Set to `'true'` for MinIO path-style addressing. |

### Production Fail-Closed Rule
If `NODE_ENV === 'production'`:
- `STORAGE_DRIVER=mock` is **strictly rejected** at startup.
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are mandatory.
- The system will **fail closed** immediately with descriptive error messages rather than silently falling back to insecure in-memory storage.

---

## 5. Security & Signed URL TTLs

1. **Storage Key Traversal Prevention**:
   All storage keys are validated through `validateStorageKey` before reaching storage APIs. Keys with directory traversal (`../`, `..\`), absolute paths (`/`, `\`, `C:\`), null bytes, or control characters are rejected immediately with `InvalidStorageKeyError`.
2. **Ephemeral Presigned URLs**:
   - **Upload Intent TTL**: `UPLOAD_INTENT_TTL_SECONDS = 900` (15 minutes).
   - **Download URL TTL**: `DOWNLOAD_URL_TTL_SECONDS = 600` (10 minutes).
   - **No Persistence**: Presigned URLs are ephemeral strings and must **never** be stored in PostgreSQL.
3. **Zero Credential Exposure**:
   AWS secret access keys and credentials are never returned in metadata objects, never included in logs, and never exposed in client contracts.
