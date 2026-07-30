# API and Action Reference

The application is primarily server-rendered. Browser forms call Next.js server actions; route handlers exist for authentication, polling, downloads, exports, webhooks, and scheduled workers.

## 1. Authentication conventions

| Caller | Mechanism |
|---|---|
| Browser page/server action | Auth.js session cookie plus database user revalidation |
| Authenticated API route | `currentUser()` and explicit role/city checks |
| Scheduled worker | `Authorization: Bearer <CRON_SECRET>` |
| Teleduce webhook | `X-Webhook-Token`, Bearer token, or bounded query token |
| WhatsApp webhook | Meta verification token for GET and `X-Hub-Signature-256` for POST |

API routes live outside the browser auth proxy and must authenticate themselves. A new route must not rely on page-level redirect behavior.

## 2. Route handlers

### Authentication and health

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | Public Auth.js contract | Session, CSRF, callback, and credentials endpoints |
| GET | `/api/health` | Public | Returns `200` with `{ok:true,db:"ok"}` or `503` when PostgreSQL is unavailable |

### Inventory and files

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/inventory/suggest?q=` | Signed-in, city scoped | At most eight inventory search suggestions; query is capped at 120 characters |
| GET | `/api/attachments/[id]` | Signed-in, property city scoped | Streams a private image/document; `?preview=1` permits inline PDF preview |
| GET | `/inventory/[id]/portfolio` | Signed-in, property city scoped | Generates and downloads one property portfolio PDF |
| GET | `/inventory/import/template` | Admin | Downloads the canonical inventory `.xlsx` template |
| POST | `/api/export/properties` | Admin | Exports selected/filter-matched properties as re-importable `.xlsx` |
| POST | `/api/export/leads` | Admin | Exports selected/filter-matched leads as `.xlsx` |
| POST | `/api/export/property-portfolios` | Signed-in, city scoped | Streams a ZIP of up to 50 generated property PDFs |

Export selection body:

```json
{ "mode": "ids", "ids": ["property-id-1", "property-id-2"] }
```

or:

```json
{
  "mode": "filter",
  "params": { "city": "HYDERABAD", "availabilityStatus": "AVAILABLE" },
  "excluded": ["property-id-to-skip"]
}
```

The filter object uses the same validated query parameters as the corresponding list screen.

### Notifications and conversation polling

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/notifications` | Admin | Paged notification history and unread count |
| POST | `/api/notifications/mark-read` | Admin | Marks explicit IDs or all notifications read |
| GET | `/api/conversations/[id]/messages` | Conversation owner or admin | Returns up to 300 messages in ascending time order |

Notification query parameters:

- `unreadOnly=true`
- `page` (minimum 1)
- `pageSize` (1 to 100, default 50)

Mark read bodies:

```json
{ "ids": ["notification-id"] }
```

```json
{ "all": true }
```

### Teleduce

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET/POST | `/api/sync/teleduce/pull` | `CRON_SECRET` Bearer | Full CRM reconciliation followed by due match writebacks |
| GET | `/api/teleduce/webhook` | Public probe; challenge requires secret | Provider health/verification endpoint |
| POST | `/api/teleduce/webhook` | Teleduce webhook secret | Maps and upserts one or more CRM lead rows |

Worker response:

```json
{
  "ok": true,
  "pull": {
    "total": 100,
    "created": 4,
    "updated": 95,
    "skipped": 1,
    "archived": 0,
    "failed": 0,
    "mode": "live"
  },
  "writeback": {
    "processed": 0,
    "success": 0,
    "failed": 0,
    "pending": 0
  }
}
```

The webhook accepts an array, a single lead object, or common envelope keys such as `response`, `data`, `leads`, `lead`, `records`, or `record`.

### WhatsApp

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/whatsapp/webhook` | Meta verification token | Webhook subscription handshake |
| POST | `/api/whatsapp/webhook` | Meta HMAC signature | Stores inbound messages and delivery/read/failure callbacks |
| GET/POST | `/api/whatsapp/process-outbox` | `CRON_SECRET` Bearer | Retries queued outbound text messages |

WhatsApp POST is intentionally `404` until live sending credentials exist. The body limit is 1 MB, message bodies are capped, and duplicate provider message IDs are ignored by a unique constraint.

## 3. Server actions

Server actions are not a public API. Their signatures may change with the UI, but their authorization and side effects are important for maintenance.

### Session

| Action | Access | Effect |
|---|---|---|
| `loginAction` | Public | Credentials login and friendly lockout response |
| `signOutAction` | Signed-in | Ends the browser session |

### Inventory

| Action | Access | Effect |
|---|---|---|
| `createPropertyAction` | Signed-in, city scoped | Validates and creates a property with audit |
| `updatePropertyAction` | Signed-in, city scoped | Updates a non-deleted property with audit |
| `deletePropertyAction` | Admin | Soft-deletes a property and best-effort removes blobs |
| `uploadAttachmentAction` | Signed-in, city scoped | Validates bytes/size and stores a private attachment |
| `deleteAttachmentAction` | Signed-in, city scoped | Removes attachment metadata and blob |
| `bulkDeletePropertiesAction` | Admin | Deletes selected/filter-matched properties with a safety cap |
| `previewImportAction` | Admin | Parses an `.xlsx` up to 10 MB and creates an `ImportBatch` |
| `commitImportAction` | Same admin that previewed | Revalidates the stored batch and creates/updates properties in chunks of 50 |

### Leads and assignment

| Action | Access | Effect |
|---|---|---|
| `reassignLeadAction` | Admin | Manual assignment or return to the unassigned pool |
| `distributeUnassignedAction` | Admin | Even-load backfill for ownerless leads |
| `unassignAllAction` | Admin | Clears eligible local assignments |
| `unassignAgentAction` | Admin | Clears one agent's local assignments |
| `updateAssignmentAction` | Assigned agent/admin as enforced | Updates working status/note |
| `agentUnassignAction` | Assigned agent | Returns lead with mandatory reason/history |
| `bulkDeleteLeadsAction` | Admin | Deletes leads and suppresses CRM recreation where applicable |
| `dismissUnassignmentAction` | Admin | Closes a returned-lead follow-up record |
| `syncTeleduceNowAction` | Admin, throttled | Runs the same reconciliation as the scheduled worker |

### Matching

| Action | Access | Effect |
|---|---|---|
| `setMatchStatusAction` | Signed-in, city scoped | Recomputes criteria, upserts current match, appends history, and triggers writeback |
| `clearMatchAction` | Signed-in, city scoped | Removes only a shortlist; shared/closed outcomes are retained |

### Conversations

| Action | Access | Effect |
|---|---|---|
| `startConversationAction` | Signed-in, lead city scoped | Claims the single active conversation for a lead |
| `endConversationAction` | Owner or admin | Ends and unlocks the conversation |
| `sendMessageAction` | Conversation owner | Sends immediately or records a queued outbound text |
| `sharePropertyAction` | Conversation owner | Sends a formatted property summary and records a snapshot |

### Settings

| Action | Access | Effect |
|---|---|---|
| `createUserAction` | Admin | Creates bcrypt credentials, role, cities, and areas |
| `updateUserAction` | Admin | Updates access; releases assignments made invalid by the change |
| `deactivateUserAction` | Admin | Soft-deactivates and releases assigned leads |
| `resetPasswordAction` | Admin | Replaces the bcrypt hash without auditing secret material |
| `createLocalityAction` | Admin | Creates a locality, using city centroid when coordinates are omitted |
| `updateLocalityAction` | Admin | Updates locality/CRM mapping and approximate-coordinate flag |
| `deleteLocalityAction` | Admin | Deletes only when no property, lead, or agent references remain |

The user actions prevent self-demotion/self-deactivation and use a serializable transaction to preserve at least one active admin.

## 4. Error and caching behavior

- Auth failures use `401`; authenticated but unauthorized requests use `403`.
- Missing accessible resources normally use `404`.
- Worker/provider failures return `500`; storage retrieval failure returns `502`.
- Dynamic/private endpoints use `no-store` or private caching.
- Downloads set `nosniff` and restrictive content security headers.
- Webhook item processing is isolated so one malformed record does not discard other records in the same delivery.

## 5. Adding a route

1. Choose Node runtime if the handler uses Prisma, crypto, files, or provider SDKs.
2. Authenticate inside the handler.
3. Apply role and city scope before querying.
4. Validate URL/body input and cap unbounded strings, arrays, pages, and file sizes.
5. Use the service/query layer rather than duplicating domain logic.
6. Set explicit caching and safe download/security headers.
7. Add tests, then document the contract here.
