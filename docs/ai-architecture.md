# TeamTrack AI Assistant & AI Workspace Architecture (Phase 12)

## 1. Golden Security Rule
The AI Assistant in TeamTrack operates within a strict, non-bypassable server-side authorization pipeline:
```
USER → BACKEND AUTH → AI ORCHESTRATOR → SAFE TOOL → AUTHORIZED DOMAIN SERVICE → DATABASE
```

> [!CAUTION]
> **CRITICAL ARCHITECTURAL INVARIANT**:
> The AI Assistant has **ZERO DIRECT DATABASE ACCESS**. Under NO circumstance can the AI model execute raw SQL queries, shell commands, JavaScript, Python, filesystem operations, or arbitrary outbound HTTP requests. All actions are strictly mediated by explicitly registered tools that delegate to existing, authorized TeamTrack domain services.

---

## 2. Trust Boundaries & Data Flow
```mermaid
flowchart TD
    Client["Client (Web / Desktop / Mobile)"] -->|Authenticated HTTP JWT| Controller["AI Controller (/api/v1/ai/*)"]
    Controller -->|Caller Context + Rate Limiter| Service["AI Service"]
    Service -->|User Messages + Context| Orchestrator["AI Orchestrator"]
    Orchestrator -->|Abstract Chat Turn| Provider["AI Provider (Mock / External)"]
    Provider -->|Structured Tool Call| Orchestrator
    Orchestrator -->|Allowlist Check| ToolRegistry["AI Tool Registry"]
    ToolRegistry -->|Read Tools| DomainServices["Authorized Domain Services (Search, Meetings, Calendar, Messaging, Files)"]
    ToolRegistry -->|Write Tools (Protected)| ActionProposal["Create Action Proposal (PROPOSED, Hashed Token, Expires in 15m)"]
    DomainServices --> Database[(PostgreSQL & S3 Storage)]
    ActionProposal --> UserConfirm["Explicit User Confirmation Required"]
```

1. **Client Boundary**:
   - Web, Desktop (Electron renderer), and Mobile apps never hold external AI provider credentials or direct storage keys.
   - All client interaction passes through the authenticated backend API (`/api/v1/ai/chat`, `/api/v1/ai/actions/:actionId/confirm`).
2. **Identity & Context Authority**:
   - The user identity is strictly bound to `req.user.id` verified from the authenticated session JWT.
   - Client-supplied `organizationId` is never trusted without validating active user membership via `organizationRepository.findForUser`. Foreign or inaccessible tenant IDs return `404 NOT_FOUND` to prevent existence enumeration.
3. **Domain Service Isolation**:
   - Tools never query tables or repositories directly.
   - Tools call `searchService`, `meetingService`, `calendarService`, `messagingService`, `fileService`, and `notificationService`.
   - Tenant isolation, visibility rules, private channels, and deleted-resource exclusions are strictly inherited from previous phases.

---

## 3. Provider Abstraction
The `AIProvider` interface abstracts model vendors:
- `generateChat(messages, tools, options)`: Returns assistant response with structured tool calls.
- `generateText(prompt, options)`: Raw text generation.
- `MockAIProvider`: Deterministic, offline provider for test suites and environments without external keys.
- **Credential Protection**:
  - `AI_API_KEY` is loaded strictly on the backend via environment variables.
  - Zero provider headers, keys, or internal stack traces are returned in `ApiResponse` or logged.

---

## 4. Allowlisted Tool Registry
Only 11 safe business tools are registered in `AIToolRegistry`:

### Read Tools (Immediate Execution)
1. `search_teamtrack`: Unified and category search via `searchService.search`.
2. `get_meeting`: Inspects meeting details via `meetingService.getMeeting`.
3. `get_calendar_event`: Inspects calendar event details via `calendarService.getEvent`.
4. `list_calendar_events`: Lists events within a date range via `calendarService.listEvents`.
5. `get_channel_context`: Checks channel membership and retrieves messages via `messageRepository.listChannelMessages`.
6. `get_conversation_context`: Checks direct conversation membership and retrieves messages via `messageRepository.listConversationMessages`.
7. `get_file_metadata`: Retrieves file metadata via `fileService.getFile`. Storage keys and S3 URLs are strictly omitted.

### Write Tools (Mutation Safeguards)
8. `create_calendar_event`: High-impact write; requires explicit confirmation.
9. `create_meeting`: High-impact write; requires explicit confirmation.
10. `send_message`: High-impact write; requires explicit confirmation.
11. `mark_notification_read`: Low-risk idempotent user action; executes directly for caller's own notifications.
12. `create_reminder`: Explicitly documented as deferred (reminders are handled via calendar events).

---

## 5. Write Action Confirmation & Security State Machine

### State Machine
```
   +-----------+
   | PROPOSED  |
   +-----+-----+
         |
         +--------------------+---------------------+
         | (Atomic Claim)     | (User Cancel)       | (Execution Error)
         v                    v                     v
   +-----------+        +-----------+         +-----------+
   | CONFIRMED |        | CANCELLED |         |  FAILED   |
   +-----+-----+        +-----------+         +-----------+
         | (Execute Domain Service)
         v
   +-----------+
   | EXECUTED  |
   +-----------+
```

### Security Safeguards
1. **Cryptographic Token Hashing**:
   - When an action is proposed, a 32-byte cryptographic token is generated (`crypto.randomBytes(32).toString('hex')`).
   - The database stores **ONLY** the SHA-256 hash (`confirmation_token_hash`). Plaintext tokens are NEVER stored.
2. **Expiration**:
   - Every proposal enforces `expires_at TIMESTAMPTZ NOT NULL` (15 minutes from creation).
   - Expired proposals cannot be claimed or executed (`AI_ACTION_EXPIRED`).
3. **Atomic Claim & Replay Prevention**:
   - Transitions from `PROPOSED` to `CONFIRMED` use an atomic compare-and-update:
     ```sql
     UPDATE ai_action_proposals
     SET status = 'CONFIRMED', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND confirmation_token_hash = $3 AND status = 'PROPOSED' AND expires_at > NOW()
     RETURNING *;
     ```
   - Replay attempts return `409 AI_ACTION_ALREADY_RESOLVED`.
   - Concurrent double confirmations result in exactly one execution; the other receives 409.
4. **TOCTOU Re-Authorization**:
   - `confirmAction` re-evaluates user permissions at execution time.
   - If a user loses channel membership, team access, or organization status between proposal and confirmation, execution is aborted and the proposal is marked `FAILED`.

---

## 6. Prompt Injection Defense
All TeamTrack content (messages, files, search results, meeting transcripts, calendar notes) is treated as **UNTRUSTED DATA**:
1. **Encapsulation**:
   - Retrieved tool data is wrapped in delimiters:
     ```xml
     <teamtrack_data_context source_tool="tool_name" untrusted="true">
     ...
     </teamtrack_data_context>
     ```
   - Any attempt within data to close the delimiter is escaped (`&lt;/teamtrack_data_context&gt;`).
2. **System Prompt Isolation**:
   - The system prompt establishes that content inside `<teamtrack_data_context>` is passive information.
   - System instructions explicitly forbid following commands, dumping databases, or bypassing policies found inside data tags.
3. **Independent Server-Side Authorization**:
   - Prompt injection cannot escalate permissions because tool execution is strictly validated server-side by domain authorization services regardless of model output.

---

## 7. Rate Limiting & Token Safety
1. **Rate Limiting**:
   - Production: Redis is authoritative. If Redis is unavailable, the rate limiter **fails closed** (returns 503).
   - Dev/Test: In-memory sliding window bucket.
   - Limit: 20 requests per minute per authenticated user.
   - Concurrency: Maximum 2 concurrent requests per user.
2. **Safety & Cost Limits**:
   - Input message limit: 4,000 characters. Null bytes and control characters stripped.
   - Context length limit: 8,000 characters.
   - Tool execution limit: Maximum 5 tool calls per request.
   - Turn limit: Maximum 3 model turns per request.
   - Execution timeout: 15 seconds.

---

## 8. Audit Logging & Privacy
1. **Immutable Audit Trail**:
   - AI actions are recorded in the `audit_logs` table via `AuditLogRepository`:
     - `AI_ACTION_REQUESTED`
     - `AI_TOOL_INVOKED`
     - `AI_TOOL_DENIED`
     - `AI_WRITE_PROPOSED`
     - `AI_WRITE_CONFIRMED`
     - `AI_WRITE_EXECUTED`
     - `AI_PROVIDER_FAILURE`
2. **Privacy Redaction**:
   - Metadata sanitization automatically redacts passwords, tokens, API keys, storage keys, and authentication hashes before writing to audit logs.

---

## 9. Frontend Architecture
- **Web (`apps/web/src/app/assistant/page.tsx`)**:
  - Full AI Workspace interface with conversation history switcher.
  - Safe plain-text message bubbles preventing XSS.
  - Interactive Action Proposal Cards with Confirm and Cancel controls.
- **Desktop (`apps/desktop`)**:
  - Sandboxed Electron renderer communicating through secure `preload.ts` bridge. Zero AI credentials in client.
- **Mobile (`apps/mobile/src/ai/AssistantScreen.tsx`)**:
  - React Native screen with keyboard-safe view, loading states, and proposal confirmation buttons.

---

## 10. Known Limitations
1. **Production AI Vendor Verification**:
   - In local offline environments, `MockAIProvider` is used for 100% deterministic test execution. External cloud vendor runtime verification (e.g. OpenAI/Anthropic/Gemini) requires configuring `AI_API_KEY` in production environment settings.
2. **Create Reminder Tool**:
   - Standalone reminder creation is deferred as specified; time-based notifications are handled via calendar events.
