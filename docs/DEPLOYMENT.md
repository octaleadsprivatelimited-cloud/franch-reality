# Deployment Guide

The repository is packaged as a provider-neutral container and is ready for Azure Container Apps. The same image can run on another container platform when it supplies HTTPS ingress, secrets, PostgreSQL connectivity, private object storage, and an external scheduler.

## 1. Production topology

```mermaid
flowchart TB
    Internet["HTTPS users and provider webhooks"] --> Ingress["Managed HTTPS ingress"]
    Ingress --> App["Franch Realty application container"]
    App --> DB[("Managed PostgreSQL")]
    App --> Blob[("Private Blob/R2 storage")]
    App --> CRM["Corefactors Teleduce"]
    App --> WA["WhatsApp Cloud API"]
    Scheduler["Managed scheduled jobs"] -->|"Bearer-protected HTTPS"| App
    Registry["Container registry"] --> App
```

Recommended Azure services:

- Azure Container Registry;
- Azure Container Apps for the web service;
- Azure Database for PostgreSQL Flexible Server;
- Azure Blob Storage;
- Container Apps Jobs, Logic Apps, or another managed scheduler for worker endpoints;
- a client-owned secret store and monitoring workspace.

## 2. Build artifacts

Application image:

```bash
docker build -t franch-realty-platform:<commit-sha> .
```

Migration image:

```bash
docker build -f Dockerfile.migrate -t franch-realty-platform-migrate:<commit-sha> .
```

The application image:

- builds Next.js standalone output;
- generates Prisma Client for Linux Alpine;
- runs as a non-root user;
- listens on container port 3000;
- does not contain development tests, docs, Git metadata, or `.env`;
- does not run migrations automatically.

Use immutable commit/image-digest tags. Do not deploy `latest` as the only traceable version.

## 3. PostgreSQL

1. Provision PostgreSQL in the same region as the application.
2. Require TLS.
3. Create a dedicated application database/user with only required schema privileges.
4. Enable automated backups and point-in-time restore.
5. Configure network access from the application and migration job.
6. Set `DATABASE_URL` as a secret.

Example shape:

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require&connection_limit=5&pool_timeout=20
```

Tune the connection limit to the service's maximum replicas and database capacity. Test connection behavior under scale-out before go-live.

## 4. Object storage

### Azure Blob Storage

Set:

```text
STORAGE_PROVIDER=azure
AZURE_STORAGE_CONNECTION_STRING=<secret>
AZURE_STORAGE_CONTAINER=attachments
```

Alternatively provide `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_KEY`.

### Cloudflare R2/S3

Set:

```text
STORAGE_PROVIDER=s3
S3_ENDPOINT=<endpoint>
S3_REGION=auto
S3_ACCESS_KEY_ID=<secret>
S3_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=franch-attachments
S3_FORCE_PATH_STYLE=true
```

Keep the bucket/container private. The application serves attachments through an authenticated, city-scoped route. CORS/public-read configuration is not required.

## 5. Environment and secrets

Required:

- `DATABASE_URL`
- `AUTH_SECRET` (fresh random value, at least 32 characters)
- `AUTH_URL` (the final HTTPS application URL)
- `CRON_SECRET` (fresh random value, at least 32 characters)
- one complete storage-provider configuration

Corefactors:

- `TELEDUCE_API_BASE_URL`
- `TELEDUCE_API_KEY`
- `TELEDUCE_CITY_FILTER`
- `TELEDUCE_WEBHOOK_SECRET`
- `TELEDUCE_ALLOW_MOCK`

WhatsApp:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION`

Optional:

- `NEXT_PUBLIC_GOOGLE_STATIC_MAPS_KEY`

Rules:

- store secrets in the deployment platform's secret mechanism, not plain environment manifests;
- restrict the map key by production HTTP referrer;
- set `TELEDUCE_ALLOW_MOCK` only for a deliberate non-live environment;
- never transfer production values through Git, issue comments, logs, or documentation.

## 6. Apply migrations

Before releasing application code that requires a new schema, run the migration image once with the production `DATABASE_URL`:

```bash
docker run --rm -e DATABASE_URL="<production-direct-url>" \
  franch-realty-platform-migrate:<commit-sha>
```

On Azure, run the equivalent as a Container Apps Job with the database secret injected.

The command is `prisma migrate deploy`; it applies committed migrations only. It does not seed or reset data.

Deployment order for backward-compatible changes:

1. database snapshot;
2. migration job;
3. application image;
4. smoke tests;
5. scheduler/webhook enablement.

Use an expand/migrate/contract release for destructive or incompatible schema changes.

## 7. Deploy the application

Container settings:

| Setting | Value |
|---|---|
| Container port | `3000` |
| Transport | HTTPS at managed ingress |
| Health path | `/api/health` |
| CPU/memory | Start at 0.5 vCPU / 1 GiB; verify PDF/import peak usage |
| Identity | Non-root image user |
| Minimum replicas | At least 1 when immediate webhook availability is required |

The health endpoint checks PostgreSQL and returns `503` if the database cannot be reached. Configure readiness and liveness thresholds so a brief database restart does not cause a rapid restart loop.

PDF generation and Excel import buffer files in memory. Load-test representative images, a 20 MB document upload, a 10 MB workbook, and a 50-portfolio ZIP before reducing memory.

## 8. Scheduled workers

The platform does not embed a scheduler. Configure managed HTTPS jobs:

| Schedule | Request | Purpose |
|---|---|---|
| Every 30 minutes | `POST /api/sync/teleduce/pull` | Full CRM reconcile and due CRM writebacks |
| Every 2-5 minutes | `POST /api/whatsapp/process-outbox` | Retry queued outbound WhatsApp texts |

Both requests require:

```http
Authorization: Bearer <CRON_SECRET>
```

The sync endpoint allows up to 60 seconds at the Next.js route level. Ensure the ingress/job timeout is at least as long. Monitor duration against the 25,000-lead adapter cap.

Do not place `CRON_SECRET` in a query string.

## 9. Webhook configuration

### Corefactors

Callback:

```text
https://<host>/api/teleduce/webhook
```

Prefer `X-Webhook-Token` or Bearer authentication. A query token is supported only for providers unable to set a header because URLs can enter access logs.

### WhatsApp

Callback:

```text
https://<host>/api/whatsapp/webhook
```

Configure the same value as `WHATSAPP_VERIFY_TOKEN` during Meta verification. Runtime POST requests are verified with the app secret HMAC.

## 10. Initial data and accounts

Do not run the demonstration seed as production provisioning.

Recommended production sequence:

1. Run migrations.
2. Load the locality master through a reviewed, client-owned provisioning step.
3. Create at least two real admins with unique strong passwords.
4. Create active agent users whose identity matches Corefactors owner values.
5. Assign cities and optional areas.
6. Import real inventory using the in-app preview/commit flow.
7. Enable live CRM credentials and run one manual read/reconcile.
8. Configure WhatsApp only after provider verification.

If `prisma/seed.ts` is used in a controlled pre-production environment, set a private `SEED_DEFAULT_PASSWORD`, rotate/remove synthetic accounts, and ensure `SEED_MOCK_INVENTORY` is appropriate.

## 11. Smoke tests

After every release:

- `GET /api/health` is `200`;
- admin login works and an invalid login fails;
- agent city restrictions hold;
- dashboard loads and sync status is visible;
- one inventory search works;
- one private image/PDF downloads only while authenticated;
- one portfolio PDF is generated;
- CRM sync endpoint rejects a bad Bearer and accepts the scheduler secret;
- Teleduce mode is expected (`live`, not accidental mock);
- webhook test delivery creates/updates a non-production lead;
- WhatsApp endpoint/configuration state matches the release plan.

## 12. Observability

Monitor:

- application HTTP 5xx and latency;
- container restarts and memory;
- `/api/health`;
- latest `SyncLog` status, duration, processed/failed counts, and drift;
- queued/failed message count;
- pending/failed writeback count;
- database storage, connections, slow queries, and backup status;
- object-storage errors.

Process-level unhandled errors are written as structured JSON by `src/instrumentation.ts`. Connect container stdout/stderr to the client's logging platform and configure alerting without including PII payloads.

## 13. Rollback

### Application only

Redeploy the last known-good image digest. Because images are immutable, this should not require a rebuild.

### Schema

Prisma migrations are forward-only. Prefer a corrective migration. For destructive data loss, restore the pre-release managed snapshot and deploy the application version matching that schema.

Never use `prisma migrate reset` in production.

### Configuration

Restore the prior secret/config revision and restart/redeploy. Rotate a secret instead of merely reverting if it may have leaked.

### CRM or messaging incident

- Disable the scheduled job.
- Remove/rotate affected provider credentials.
- For Teleduce, blank live credentials only if the environment is also prevented from accepting mock production data.
- Preserve `SyncLog`, `AuditLog`, and queued records for diagnosis.

## 14. Production checklist

- [ ] Client-owned repository and immutable release tag selected.
- [ ] Dependency audit, lint, typecheck, tests, and build pass.
- [ ] Database snapshot/PITR confirmed.
- [ ] Migrations applied successfully.
- [ ] Private storage read/write/delete tested.
- [ ] Fresh `AUTH_SECRET`, `CRON_SECRET`, and provider secrets installed.
- [ ] HTTPS/custom domain and `AUTH_URL` correct.
- [ ] Real admins/agents created; synthetic users removed or inactive.
- [ ] City and area scopes reviewed.
- [ ] Teleduce mode and owner mapping verified.
- [ ] Scheduled jobs enabled with Bearer headers.
- [ ] Webhooks verified.
- [ ] Monitoring and alerts active.
- [ ] Backup restore and application rollback owners identified.
- [ ] Smoke tests completed and recorded.
