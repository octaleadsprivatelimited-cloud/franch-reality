# Development Guide

## 1. Prerequisites

- Node.js 22 or newer
- npm
- Docker Desktop with Compose
- Git

The production image uses Node 22 Alpine. Developing on Node 22 gives the closest parity, although newer supported Node versions can run the project.

## 2. First-time setup

```bash
cp .env.example .env
# PowerShell: Copy-Item .env.example .env

docker compose up -d
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

The Docker services are intentionally isolated on ports 5433, 9100, and 9101. The app runs on port 3100.

Check infrastructure:

```bash
docker compose ps
```

Check the application and database after startup:

```bash
curl http://localhost:3100/api/health
```

## 3. Environment variables

`src/lib/env.ts` validates runtime configuration. A missing required value stops startup with a clear error.

### Core runtime

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `AUTH_SECRET` | Yes, min 32 chars | Auth.js signing/encryption secret |
| `AUTH_URL` | Recommended | Public application base URL |
| `CRON_SECRET` | Yes, min 32 chars | Bearer secret for scheduled worker routes |

### Storage

| Variable | Required | Description |
|---|---|---|
| `STORAGE_PROVIDER` | No | `s3` (default) or `azure` |
| `S3_ENDPOINT` | For S3 | MinIO/R2/S3 endpoint |
| `S3_REGION` | For S3 | Defaults to `auto` |
| `S3_ACCESS_KEY_ID` | For S3 | Storage access key |
| `S3_SECRET_ACCESS_KEY` | For S3 | Storage secret key |
| `S3_BUCKET` | For S3 | Private attachment bucket |
| `S3_FORCE_PATH_STYLE` | For S3 | Use `true` for local MinIO |
| `AZURE_STORAGE_CONNECTION_STRING` | For Azure, option A | Complete Blob Storage connection string |
| `AZURE_STORAGE_ACCOUNT` | For Azure, option B | Storage account name |
| `AZURE_STORAGE_KEY` | For Azure, option B | Storage account key |
| `AZURE_STORAGE_CONTAINER` | For Azure | Defaults to `attachments` |

Provider-specific storage requirements are checked when storage is first used.

### Teleduce

| Variable | Required | Description |
|---|---|---|
| `TELEDUCE_API_BASE_URL` | For live pull | Corefactors base URL |
| `TELEDUCE_API_KEY` | For live pull | Corefactors API key |
| `TELEDUCE_CITY_FILTER` | No | Comma-separated supported cities |
| `TELEDUCE_WEBHOOK_SECRET` | For webhook POST | Shared webhook secret |
| `TELEDUCE_ALLOW_MOCK` | Production mock only | Must be `true` to deliberately permit mock data in production |

Both base URL and API key must exist for live mode. Otherwise the mock adapter is selected.

### WhatsApp and map

| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | For live messaging | Cloud API phone-number ID |
| `WHATSAPP_ACCESS_TOKEN` | For live messaging | System-user access token |
| `WHATSAPP_APP_SECRET` | For live webhook | HMAC application secret |
| `WHATSAPP_VERIFY_TOKEN` | For webhook setup | Meta verification token |
| `WHATSAPP_API_VERSION` | No | Defaults to `v21.0` |
| `NEXT_PUBLIC_GOOGLE_STATIC_MAPS_KEY` | No | Enables the static map view; restrict by HTTP referrer |

### Seed-only

| Variable | Default | Description |
|---|---|---|
| `SEED_DEFAULT_PASSWORD` | `LocalDemoOnly!2026` | Password for synthetic `example.com` users |
| `SEED_MOCK_INVENTORY` | `true` | Set `false` to skip demo inventory/match generation |

Never reuse example or local Docker credentials in a shared environment.

## 4. Common commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Database commands:

```bash
npm run db:generate
npm run db:migrate -- --name descriptive_change
npm run db:deploy
npm run db:seed
npm run db:studio
```

Integration runner:

```bash
npm run teleduce:pull
```

The runner loads `.env`, selects mock/live Teleduce from configuration, reconciles leads, processes due writebacks, prints a summary, and disconnects Prisma.

## 5. Tests

Test layout:

- `tests/unit`: pure domain, parsing, filtering, security-coverage, PDF, and ZIP behavior.
- `tests/integration`: real PostgreSQL flows for matching, CRM pull, and writeback.
- `tests/helpers/db.ts`: shared Prisma client and scoped cleanup.

The integration suite uses records prefixed with `ITEST-` and cleans them in foreign-key-safe order. It still connects to the database in `DATABASE_URL`.

Never run the test command with a production database URL. Use the local Docker database or a dedicated disposable test database.

Recommended validation before committing:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

The build requires valid dummy/local values for `DATABASE_URL`, `AUTH_SECRET`, and `CRON_SECRET`, but it does not connect to PostgreSQL.

## 6. Code organization

| Path | Responsibility |
|---|---|
| `src/app/(app)` | Authenticated pages and server actions |
| `src/app/api` | Explicit HTTP contracts, webhooks, workers, and downloads |
| `src/components` | Feature-oriented UI components |
| `src/lib/queries` | Read/query layer |
| `src/lib/validation` | Zod input contracts |
| `src/lib/teleduce` | CRM adapter, mapping, sync, mock, and writeback |
| `src/lib/leads` | Owner resolution and local assignment |
| `src/lib/whatsapp` | Cloud API adapter and conversation services |
| `src/lib/pdf` | Portfolio composition, image normalization, and rendering |
| `src/lib/import` | Excel parsing/template generation |
| `prisma` | Schema, migrations, and seed |

Keep UI files focused on presentation. Reusable rules belong in `src/lib`; read access belongs in `queries`; external-system details belong behind adapters.

## 7. Change workflows

### Database change

1. Edit `prisma/schema.prisma`.
2. Create a named development migration.
3. Inspect the SQL.
4. Regenerate Prisma Client.
5. Update validation, queries, actions, UI, export/import, and docs.
6. Run the full validation suite.

### New server action

1. Add `"use server"`.
2. Authenticate with `requireUser`/`requireAdmin` or a deliberate equivalent.
3. Validate every value with Zod.
4. enforce city ownership using a server-loaded record.
5. Use a transaction when the write and audit/history must be atomic.
6. Revalidate affected paths.

### New API route

API routes are excluded from the page proxy. Add explicit authentication, bounds, cache headers, and tests. See `API_REFERENCE.md`.

### New external integration

Define a narrow interface, provide a deterministic mock, validate provider responses at runtime, add timeouts/idempotency, and keep credentials in the environment. Provider payloads containing PII must not be logged.

## 8. Styling and UI

The application uses Tailwind CSS 4 plus shared rules in `src/app/globals.css`. Existing components use feature-prefixed classes and Lucide icons. Maintain responsive behavior down to a narrow mobile viewport and retain keyboard labels, button types, error messages, and loading/disabled states.

## 9. Local troubleshooting

### Prisma cannot connect

- Confirm `docker compose ps`.
- Confirm the URL uses port 5433.
- Check `docker compose logs postgres`.
- Regenerate Prisma after dependency/schema changes.

### Attachments fail

- Confirm MinIO and `minio-setup` are healthy.
- Confirm S3 values match `.env.example`.
- Open the MinIO console and verify the `franch-attachments` bucket.
- Remember that downloads go through the authenticated application route, not a public bucket URL.

### Login fails after seeding

- Use `admin@example.com`.
- Use the `SEED_DEFAULT_PASSWORD` that was present when the seed last set the hash.
- Clear old `LoginAttempt` rows or wait 15 minutes after repeated failures.

### Live data appears in local development

Remove/blank `TELEDUCE_API_KEY` and restart. Mock/live selection occurs when the server imports the environment.

### Stale generated types

Remove only generated `.next` output, run `npm run db:generate`, then restart the dev server. Do not edit `.next` or generated Prisma files.
