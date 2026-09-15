# TeamTrack Phase 9D-D: Notification UI / Notification Center Architecture

## 1. Overview & Architectural Principles

Phase 9D-D implements the user-facing Notification Center experience for TeamTrack across Web, Desktop, and Mobile clients.

### Core Architectural Principle
**PostgreSQL / backend state is single and authoritative.**  
The client-side notification state is strictly a **projection / local cache** of authoritative server state. Clients never write to the database directly and never generate client-authoritative mutation sequence numbers or timestamps.

---

## 2. Notification Center UX & Component Hierarchy

```
[ Application Shell (AppHeader) ]
       │
       ├── Brand & Search
       └── NotificationBell
              ├── Unread Badge Pill (e.g. "3", "99+")
              └── NotificationPopover (compact dropdown)
                     ├── Popover Header ("Notifications" + unread count chip + "Mark all read")
                     ├── Filter Tabs ("All" vs "Unread")
                     ├── Scrollable NotificationList (compact items)
                     └── Footer ("View all in Notification Center →")
                                 │
                                 ▼
              [ Full Notification Center Page (/notifications) ]
                     ├── Header & Metrics (total, unread count)
                     ├── Control Bar (Tabs + Category Filter dropdown + Mark All Read + Refresh)
                     ├── Main NotificationList (rich item cards with actions & deep links)
                     └── Cursor-based Pagination ("Load More Notifications")
```

---

## 3. Realtime Synchronization & Phase 9C `mutation_seq`

The client-side notification state machine (`NotificationSyncManager` in `@teamtrack/api-client`) enforces strict sequential consistency according to Phase 9C contracts:

1. **Incoming $\text{mutationSeq} \le \text{localSeq}$:**  
   The event is identified as a stale duplicate or already applied change. It is dropped immediately without state alteration.

2. **Incoming $\text{mutationSeq} == \text{localSeq} + 1$:**  
   The event is contiguous. It is applied immediately to the local map and `localSeq` advances to `incomingSeq`. Any previously buffered contiguous events are drained.

3. **Incoming $\text{mutationSeq} > \text{localSeq} + 1$:**  
   A sequence gap is detected (e.g., missed WebSocket packets during a network blip).  
   - The out-of-order event is buffered in `pendingSequenceEvents`.  
   - The client invokes `apiClient.syncNotifications({ snapshotMutationSeq: localSeq })`.  
   - The authoritative server catch-up payload reconciles missed updates via `applySyncResponse()`.  
   - Any buffered events that are now contiguous or superseded are processed and cleaned up.

---

## 4. Cursor Pagination & Realtime Invariant

### Contract
The backend uses composite cursor pagination based on `(created_at, id)`.

### Deterministic Merging
When the user clicks **Load More Notifications**:
1. Client requests `apiClient.listNotifications({ cursor: nextCursor, limit: 20 })`.
2. Older items are appended using `syncManager.appendOlderNotifications(items)`.
3. If an item already exists in the local map (e.g. it was received via realtime or previously loaded), it is **not overwritten**.
4. Realtime notifications received while scrolling older history always stay positioned at the top of the list without being lost or clobbered.

---

## 5. Unread Count & Badge Behavior

- The unread badge dynamically reflects `syncManager.getUnreadCount()`.
- It updates reactively when:
  - Initial notifications load.
  - A `notification.created` realtime event arrives (+1).
  - A notification is marked as read (-1).
  - A notification is marked as unread (+1).
  - A `notification.read_all` event arrives (sets to 0 or server value).
  - A notification is deleted (decrements if previously unread).
  - Reconnect / catch-up sync executes.
- **No Blind Incrementing:** Unread counts are always anchored to server values.

---

## 6. Resource Navigation & Security

### Navigation Targets
When a notification has a valid resource reference:
- `channel` &rarr; `/channels/:channelId`
- `conversation` &rarr; `/conversations/:conversationId`
- `meeting` &rarr; `/meetings?meetingId=:meetingId`
- `file` &rarr; `/files/:fileId`
- Generic / fallback &rarr; `/notifications`

### Security Boundary
- **Notification resource references do NOT grant authorization.** Having a notification with `resource_id = "xyz"` does not bypass backend authorization checks.
- When the user navigates to `/channels/:channelId` or `/meetings?meetingId=...`, the normal backend authorization service validates tenant membership and permissions.
- All notification text is rendered as plain escaped strings. `dangerouslySetInnerHTML` is strictly prohibited.

---

## 7. Optimistic UI & Rollback

- **Mark Read / Unread / Delete / Mark All Read:**
  1. The client captures a state snapshot (`syncManager.getSnapshot()`).
  2. The UI applies the transition optimistically for instant responsiveness.
  3. The asynchronous REST mutation fires in the background.
  4. If the server request fails, `syncManager.restoreSnapshot(snapshot)` restores the state and presents non-blocking feedback.
  5. The server's subsequent realtime event provides ultimate authority.

---

## 8. Cross-Client & Multi-Window Consistency

Because state mutations emit WebSocket events to `user:${userId}`:
- Marking a notification as read on the Desktop or Mobile client emits `notification.read`.
- Open Web browser tabs receive the event via WebSocket, advance their `mutation_seq`, and update their badges in real time.
- All clients remain strictly synchronized without background polling.

---

## 9. Accessibility & Mobile Responsiveness

- **Keyboard Navigation:** Popover and list items support `Tab`, `Enter`, `Space`, and `Escape` to dismiss.
- **Screen Reader Support:** Buttons include explicit `aria-label` attributes (e.g. `aria-label="Notifications, 3 unread"`), and dialog attributes (`aria-haspopup="dialog"`, `aria-expanded`).
- **Responsive Layout:** Web and desktop feature a flyout popover and a full dashboard page; mobile provides touch-friendly cards with swipe/tap actions and pull-to-refresh.
