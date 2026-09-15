# TeamTrack Disaster Recovery & Business Continuity Plan

This document outlines the failure scenarios, recovery objectives, and explicit procedures for restoring TeamTrack in a disaster event.

## 1. Objectives

- **Recovery Point Objective (RPO):** 1 Hour (Target). Dependent on DB snapshot frequency and continuous archiving (WAL).
- **Recovery Time Objective (RTO):** 2 Hours (Target).

> [!WARNING]
> **Documentation Only:** These targets are recommendations based on typical managed infrastructure capabilities.
> 
> Status:
> - **IMPLEMENTED**: Code/Config mechanisms exist (e.g. migrate.ts rollback handles, AWS S3 buckets structure).
> - **DOCUMENTED**: Yes, in this file.
> - **TESTED**: Local dev/test environments only.
> - **NOT TESTED**: RESTORE TEST: NOT VERIFIED. Real production data restoration has not been exercised.

## 2. Infrastructure Failure Scenarios

### A. Database Failure or Data Corruption
- **Detection:** `/ready` probe returns 503 (`database: down`). Application logs show connection timeouts.
- **Immediate Response:** Stop deployments. Pager alerts on-call.
- **Recovery:**
  1. Determine if failure is transient network issue or hardware failure.
  2. If data corruption occurred, initiate point-in-time recovery (PITR) via the managed PostgreSQL provider to the last known good state.
  3. Validate recovered database instance data integrity via a temporary bastion host.
  4. Update `PRODUCTION_DATABASE_URL` secrets to point to the new instance.
  5. Restart backend services.

### B. Redis Failure
- **Detection:** `/ready` probe returns 200 but shows `redis: degraded`. Rate limits start failing closed with `503`.
- **Immediate Response:** Investigate Redis provider logs.
- **Recovery:** 
  1. Because Redis is not the source of truth for durable data, a completely new Redis instance can be provisioned.
  2. Update `REDIS_URL`.
  3. Clients will automatically reconnect for WebSockets, and pub/sub will resume. Any transient sessions lost will force a client re-login if JWTs rely on Redis (note: JWTs are stateless, but refresh token invalidation lists might be affected).

### C. Application Region Outage
- **Detection:** Global load balancer health checks fail.
- **Immediate Response:** If running active-passive, initiate DNS failover.
- **Recovery:** Deploy the latest Docker images to the failover region, pointing to a replicated or restored database.

### D. Object Storage Failure
- **Detection:** Upload/download APIs return 5xx errors from the storage provider.
- **Recovery:** Fail over to the replica bucket (requires cross-region replication enabled on the provider). Update `S3_BUCKET` configuration.

## 3. Secret Rotation & Compromise

If a critical secret is leaked:
1. **JWT Secret (`ACCESS_TOKEN_SECRET`):** 
   - Generate a new 64-byte hex string.
   - Deploy the new secret. **All active users will be logged out and forced to re-authenticate.**
2. **Database Credentials:**
   - Rotate password in the managed provider console.
   - Update `PRODUCTION_DATABASE_URL` in CI/CD secrets and restart containers.

## 4. Rollback Strategy

### Application Code Rollback
- Trigger a redeployment of the previously known-good Docker image tag via CI/CD.

### Database Migration Rollback
- Not all migrations are reversible (e.g., `DROP TABLE`, destructive data transformations).
- If a migration fails, the runner rolls back the transaction.
- If a migration succeeds but introduces a critical application bug, you MUST write a new reverse-migration (e.g., `ADD COLUMN` back) and deploy it forward. 
- **Do not manually modify the `schema_migrations` table.**

## 5. Communications
- Communicate status updates via [YOUR_STATUS_PAGE].
- Internal coordination via emergency incident response channel.
