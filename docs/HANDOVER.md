# Codebase Handover

This document defines what is being transferred, which systems remain external, what the receiving team must configure, and where future developers should begin.

## 1. Handover contents

The repository includes:

- complete application source;
- Prisma schema and forward-only migrations;
- synthetic local seed data;
- unit and PostgreSQL integration tests;
- Docker application and migration images;
- local PostgreSQL/MinIO Compose setup;
- safe environment template;
- architecture, database, API, development, deployment, operations, and user documentation.

The repository deliberately excludes:

- real environment files and secrets;
- production database dumps;
- customer leads/messages/attachments;
- client inventory workbooks and provider exports;
- internal planning/audit reports;
- one-off document generators and developer-assistant instructions;
- dependencies and generated build output.

## 2. External systems to transfer

The client should own or receive access to:

| System | Required ownership/material |
|---|---|
| GitHub | Final private repository and admin access |
| Container platform | Registry, application service, migration job, scheduled jobs |
| PostgreSQL | Admin/break-glass access, app user, backups, restore procedure |
| Object storage | Private container/bucket, scoped credentials, retention |
| Corefactors Teleduce | API key, webhook configuration, support contact |
| WhatsApp Business | Meta app, phone-number ID, system-user token, app secret, verify token |
| DNS/TLS | Application domain and certificate ownership |
| Google Maps (optional) | Restricted static maps key |
| Monitoring | Logs, alerts, dashboards, incident ownership |

Transfer secret values outside Git using the client's approved secret manager.

## 3. Known integration boundaries

### Teleduce writeback

Lead retrieval and real-time webhook ingestion are implemented. The live adapter is read-only until Corefactors supplies an official lead-stage update API.

Share/close match decisions are fully stored with history and show `PENDING`; they are not pushed to the CRM yet. Future work is isolated to the adapter and contract tests described in `ARCHITECTURE.md`.

### WhatsApp

The conversation, queue, webhook, delivery-state, property-share, and oversight flows are implemented. Live delivery requires client-owned Cloud API credentials and scheduler configuration. Without credentials, outbound records remain queued.

### Scheduling

The application exposes protected worker endpoints but does not embed a scheduler. The deployment owner must configure:

- Teleduce reconcile every 30 minutes;
- WhatsApp outbox every 2-5 minutes.

## 4. Repository transfer procedure

The temporary public-repository workflow must be treated as public disclosure: anyone can read or fork the code during that window.

GitHub's current behavior is:

- all forks of a public repository are public;
- a fork's visibility cannot be changed directly;
- making the original repository private detaches existing public forks, which remain public.

See GitHub's official documentation on [fork visibility](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-permissions-and-visibility-of-forks) and [visibility changes](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

If the client's final repository must be private, use this safer sequence:

1. Keep the handoff repository public only for the agreed transfer window.
2. Have the client create a new private standalone repository.
3. Mirror/clone-push the handoff commit and tags into that private repository instead of relying on a public fork.
4. Have the client verify commit SHA, build, tests, docs, and admin access.
5. Make the handoff repository private.
6. Confirm no unwanted public fork/copy remains under either party's control.

If the client intentionally chooses a public fork, making the source private later will not make their fork private.

## 5. Receiving-team verification

The receiving engineer should:

- clone the exact handoff commit;
- confirm `git status` is clean;
- copy `.env.example` to a local `.env`;
- start Docker services;
- run `npm ci`;
- run Prisma generate/migrations/seed;
- run lint, typecheck, tests, build, and the production dependency audit;
- log in with a synthetic account;
- verify inventory, matching, and one private attachment;
- review every document in `docs`;
- compare the deployed schema migration table with the repository;
- verify backup/restore and secret ownership.

## 6. Production ownership checklist

- [ ] Two or more client-owned active admins exist.
- [ ] Synthetic `example.com` accounts are removed/inactive in production.
- [ ] Real agent identities match Corefactors owner strings.
- [ ] City and area access is approved.
- [ ] Database and object-storage backup restore has been tested.
- [ ] Production secrets are unique and stored client-side.
- [ ] Teleduce mode is live and scheduled reconciliation is healthy.
- [ ] Corefactors webhook is authenticated and delivering.
- [ ] WhatsApp configuration/scope is explicitly accepted or disabled.
- [ ] Worker schedules, timeouts, and alerts are active.
- [ ] The exact Git commit and image digest are recorded.
- [ ] Rollback owner and incident contact are named.
- [ ] Client confirms repository ownership and access.

## 7. Where future developers should start

| Enhancement | Start here |
|---|---|
| Inventory field/form/import/export | `prisma/schema.prisma`, property validation, inventory actions, `lib/import/book1.ts` |
| Search/filter behavior | `lib/queries`, validation schemas, search-param parsers |
| Matching rules/ranking | `lib/matching.ts`, `lib/matching-service.ts`, matching tests |
| CRM field mapping | `lib/teleduce/corefactors-client.ts`, `mapping.ts`, `requirement-parser.ts` |
| CRM writeback | `lib/teleduce/corefactors-client.ts`, `writeback.ts` |
| Assignment policy | `lib/leads/assignment.ts`, lead actions/queries |
| WhatsApp media/templates | `lib/whatsapp/client.ts`, conversations/actions, webhook |
| New role/permission | auth helpers, query scopes, every affected action/route |
| Database performance | Prisma indexes, query layer, production query metrics |
| Deployment provider | Dockerfiles, `next.config.ts`, deployment guide |

Before changing a module, read its architecture section and corresponding tests.

## 8. Recommended next enhancements

1. Complete and contract-test the official Corefactors stage-writeback adapter.
2. Add a client-owned automated deployment pipeline with migration approval and smoke tests.
3. Add monitoring dashboards for sync drift, writeback/message queues, HTTP errors, and database saturation.
4. Add WhatsApp template/media sending when business templates are approved.
5. Replace any approximate locality centroids with reviewed coordinates.
6. Add browser-level end-to-end tests against the disposable CI service stack.

## 9. Acceptance record

At handover, record:

- source repository URL;
- handoff commit SHA and tag;
- validation results;
- deployment image digest;
- schema migration version;
- client repository/admin confirmation;
- secret transfer confirmation without secret values;
- outstanding provider-owned dependencies;
- sign-off date and responsible people.

Do not record passwords, keys, tokens, customer PII, or database dumps in the acceptance record.
