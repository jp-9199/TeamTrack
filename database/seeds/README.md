# TeamTrack Database Seeds Guide

This directory is reserved for local development and testing seed scripts.

---

## Seed Guidelines & Security Rules

1. **Development & Staging Isolation**:
   - Seed scripts are strictly intended for local development environments, automated integration tests, and staging review.
   - Seed scripts must **never** be executed automatically or manually against production databases.

2. **No Real Secrets or Sensitive Data**:
   - Seed files must **never** contain real passwords, API keys, credentials, or production connection strings.
   - Seed data must not contain real Personally Identifiable Information (PII) of real individuals.

3. **Deterministic & Idempotent**:
   - When seed scripts are implemented in subsequent development phases, they should be deterministic and idempotent where practical, utilizing fixed test UUIDs (e.g. `00000000-0000-0000-0000-000000000001`) and `ON CONFLICT DO NOTHING` clauses to prevent duplicate rows across multiple runs.

4. **Phase 3 Status**:
   - In accordance with Phase 3 specifications, no fake production users, organizations, or credentials are populated in this phase.
