# Operations Runbook

This runbook is for the engineer or administrator operating the deployed platform.

## 1. Health and first response

Health probe:

```bash
curl https://<host>/api/health
```

Healthy:

```json
{ "ok": true, "db": "ok" }
```

A `503` means the process answered but PostgreSQL did not. Check database availability, networking, TLS, credentials, connection limits, and recent migrations before restarting repeatedly.

For an incident:

1. Record the release commit/image digest and incident time.
2. Check application/container health and database metrics.
3. Check the latest `SyncLog` and `AuditLog`.
4. Disable only the affected scheduled job/provider integration if the core app is healthy.
5. Preserve logs and queue state.
6. Roll back only after identifying whether code, schema, configuration, provider, or data is responsible.

## 2. Teleduce operating modes

| Mode | Condition | Behavior |
|---|---|---|
| Mock | Base URL or API key is blank | Deterministic synthetic leads |
| Live scheduled | Both credentials set, no recent webhook | Full pull is the active source |
| Live real-time | Both credentials set and webhook deliveries exist | Webhook is primary; full pull remains reconciliation/backstop |

Production refuses mock mode unless `TELEDUCE_ALLOW_MOCK=true`. The UI displays the current mode.

## 3. Scheduled CRM reconciliation

The scheduler calls:

```bash
curl -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://<host>/api/sync/teleduce/pull
```

Each run:

1. Creates a `RUNNING` `SyncLog`.
2. Fetches all paged Corefactors leads.
3. Maps, validates, and idempotently upserts by `teleduceLeadId`.
4. Resolves the upstream owner or local assignment policy.
5. Creates capped new-lead notifications.
6. Reconciles missing upstream records through safe soft archive.
7. Processes due CRM writebacks when the adapter supports them.
8. Removes notifications older than 90 days.
9. Completes the `SyncLog`.

Expected dashboard drift is under 30-40 minutes. A growing drift means the scheduler is not reaching a successful run.

### Sync statuses

| Status | Meaning |
|---|---|
| `SUCCESS` | All mapping succeeded and reconciliation was safe |
| `PARTIAL` | Some rows failed or archive was skipped because the pulled set looked truncated |
| `FAILED` | Provider, configuration, mapping envelope, or database failure aborted the run |

### Safe manual run

From a trusted environment configured with the intended database and provider mode:

```bash
npm run teleduce:pull
```

Or use the admin dashboard's throttled **Sync now** control.

Before a manual live run, confirm:

- `DATABASE_URL` points to the intended environment;
- live API credentials are expected;
- recent run drift actually requires a manual action;
- no concurrent provider maintenance is in progress.

## 4. Sync troubleshooting

### `401` from the worker route

- Verify the `Authorization` scheme is `Bearer`.
- Verify the job and application use the same `CRON_SECRET`.
- Rotate/redeploy if the secret is uncertain.
- Do not add a query-string fallback.

### Provider `401`/`403`

- Verify `TELEDUCE_API_KEY`.
- Verify the base URL and provider account permissions.
- Rotate the key through the client/provider process.

### `PARTIAL` with mapping failures

- Read the `SyncLog.message` and bounded `errorDetails`.
- Compare the current provider envelope/field names with `corefactors-client.ts`.
- Reproduce against a sanitized single record.
- Add validation/mapping tests before deploying.

Do not log full CRM payloads; they contain customer PII.

### Archive skipped

The pull returned fewer than 50% of current active CRM leads. This is a deliberate mass-archive safeguard.

- Check pagination flags and provider incident status.
- Confirm response-shape validation.
- Do not manually archive the difference.
- Fix the retrieval problem and run a new full reconciliation.

### Lead is not updated

- Confirm it has a stable Corefactors ID.
- Check whether the city can be resolved to Hyderabad or Chennai.
- Check `DeletedTeleduceLead`; a permanently suppressed ID will not be recreated.
- Check the most recent webhook/pull audit entry.

## 5. Owner resolution and assignment

Corefactors ownership is authoritative.

### `Owner not linked`

The upstream owner string did not resolve to exactly one active agent.

1. Inspect the lead's `leadOwner`.
2. Compare normalized email/name with active agent users.
3. Update the platform agent identity and city coverage.
4. Trigger a new sync/webhook update.

Do not distribute this lead through local round robin while the upstream owner is populated.

### Ownerless lead remains unassigned

- Verify an active `AGENT` covers the lead's city.
- Review assigned areas. An unscoped agent covers the whole city.
- Use the admin assignment view to distribute ownerless leads.
- If several agents exist, check database errors around PostgreSQL advisory locks.

### Agent returns a lead

The return reason creates a `LeadUnassignment` record. Admins should either:

- manually assign it to another agent;
- include it in a distribution pass; or
- dismiss the follow-up record when no action is needed.

### User deactivation/territory change

The user action releases assignments that are no longer valid. Review the unassigned pool and redistribute after changing roles/cities.

## 6. CRM writeback

The current live Corefactors adapter is read-only because the provider has not supplied a supported stage-update API.

Current behavior:

- shortlist is `NOT_REQUIRED`;
- share/close saves the decision and becomes `PENDING`;
- the read-only adapter does not increment attempts or spin the retry job;
- UI/audit/history remain accurate even though the CRM stage is not changed.

Do not mark these records `SUCCESS` manually.

When a supported API is delivered, follow the enablement steps in `ARCHITECTURE.md`, test in a provider sandbox, then release the pending queue in a controlled batch.

For a write-capable adapter, retry behavior is:

- maximum 8 attempts;
- 10-minute initial backoff;
- exponential growth capped at 6 hours;
- 2-minute claim lease to prevent duplicate concurrent sends;
- terminal `FAILED` after exhaustion or when a lead has no CRM ID.

## 7. WhatsApp operations

### Configuration state

Live sending requires phone-number ID and access token. Signed inbound callbacks also require app secret and verification token.

When unconfigured:

- webhook POST returns `404`;
- outbound agent actions are recorded as `QUEUED`;
- the outbox worker no-ops.

### Outbox worker

```bash
curl -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://<host>/api/whatsapp/process-outbox
```

It processes up to 50 queued outbound text messages oldest-first. Items older than 24 hours or without a body become `FAILED`; transient provider errors remain queued.

### Queued messages growing

- Verify scheduler runs every 2-5 minutes.
- Verify credentials and provider account status.
- Inspect provider HTTP errors without exposing token/message PII.
- Check that customer phone normalization produced an E.164-like number.
- Check container outbound network/DNS.

### Inbound messages missing

- Verify Meta callback URL and subscription.
- Verify `WHATSAPP_VERIFY_TOKEN`.
- Verify `WHATSAPP_APP_SECRET` matches the app used to sign requests.
- Confirm the customer phone matches an active conversation.
- Duplicate message IDs are intentionally ignored.

### Agent cannot start a conversation

- Another active conversation may own the lead.
- The lead may be archived or lack a valid mobile number.
- The user may lack city access.
- An admin can inspect/end the active conversation from Oversight.

### Message status does not advance

Check that delivery status webhooks are subscribed and signed. Status changes only move forward; an out-of-order earlier callback is ignored.

## 8. Inventory and files

### Upload failure

- Images: maximum 5 MB.
- PDF documents: maximum 20 MB.
- Import workbook: maximum 10 MB.
- Allowed media: JPEG, PNG, GIF, WebP, PDF.

Check storage provider settings, private-container access, network, and server-action/proxy body-size settings in `next.config.ts`.

### Upload succeeds but download fails

- Verify the database `PropertyAttachment.r2Key`.
- Verify the object exists under the configured provider.
- Test while authenticated with a user who can access the property's city.
- A `502` means the metadata existed but object retrieval failed.

### Orphaned blob

Database deletes secure application state first; blob deletion is best-effort. If a provider incident leaves objects behind, compare object keys with `PropertyAttachment` rows and delete only confirmed orphans using a reviewed script.

### Import problems

- Download a fresh template from the UI.
- Preview before commit.
- Correct invalid city/locality, file number, amount, or type values.
- A staged batch belongs to the admin who created it and is deleted after commit.
- Re-importing a file number updates/restores that property.

## 9. Notifications and audit

New lead notifications are admin-visible and retained for 90 days. Marking read is global, not per-admin.

Audit entries should be used to answer who/what/when for:

- inventory changes and imports;
- user/locality management;
- lead assignment/deletion;
- match decisions/writebacks;
- sync and webhook outcomes;
- portfolio downloads.

Passwords and password hashes must never enter audit payloads. Provider payloads should be represented by counts, IDs, and field names rather than PII values.

## 10. Backups and restore

Daily operations should verify:

- managed PostgreSQL backups and PITR window;
- object storage retention/versioning as agreed;
- latest successful restore test;
- repository/image version recorded with each release.

Admin XLSX exports are useful operational backups but are not a replacement for database and object-storage backups.

After a restore:

1. Deploy the application version matching the schema.
2. Run pending committed migrations only if planned.
3. Verify login and scopes.
4. Verify a private attachment.
5. Run a read-only/live CRM reconciliation.
6. Review whether schedulers/webhooks replayed events during downtime.

## 11. Secret rotation

### `AUTH_SECRET`

Replace the deployment secret and redeploy. Existing JWT sessions will become invalid, so notify users.

### `CRON_SECRET`

Update the application and every scheduler together. Verify the new value and confirm the old value receives `401`.

### Storage credentials

Create new scoped credentials, deploy them, verify put/get/delete, then revoke the old credentials.

### Teleduce and WhatsApp

Issue a new provider token, update the secret, redeploy, verify a controlled request, then revoke the old token. Preserve webhook app secrets/verification state according to the provider's rotation procedure.

If any secret is suspected leaked, rotate it; do not simply hide or delete the Git commit.

## 12. Periodic maintenance

Weekly:

- review failed/partial `SyncLog` rows;
- review queued/failed messages and pending/failed writebacks;
- review unlinked owners and unassigned leads;
- review application/database resource usage.

Monthly:

- apply tested dependency/security updates;
- verify backups and restore readiness;
- review active users, admins, city/area scopes, and provider keys;
- inspect approximate locality coordinates and replace them with accurate centroids;
- confirm scheduler and webhook configuration.

Before each release:

- run lint, typecheck, tests, build, and dependency audit;
- review migrations and rollback;
- record image digest and change summary;
- run the deployment smoke tests.
