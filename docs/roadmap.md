# Panel1 Migration Roadmap

> Last updated: March 2026
> Breaking changes: allowed (no public release yet)
> Sources: ARCHITECTURE.md, domain-model-report, modularity-analysis, cleanup-map, types-architecture spec, deep-architecture-research, claude-01, gpt-001

---

## Current State

| Component | Status |
|-----------|--------|
| **Database** | 53 tables across 12 domains. Monolithic barrel (`db/schema/index.ts`) with duplicate DB connection. |
| **`packages/core`** | Loader, services, filters work. EventBus in-memory only (42 LOC). JobScheduler is a dead stub (22 LOC). No auth middleware. No infra services. |
| **`packages/types`** | Exists but needs slimming — should be framework-only contracts. Module service interfaces should move to each module's `types.ts`. |
| **`modules/support`** | 22 Hono endpoints, 9 tables, ~85% backend. No UI dir. Jobs stubbed. SLA metrics stubbed. |
| **`modules/audit`** | 9 Hono endpoints, 3 tables, ~80% backend. No UI dir. Export processing missing. Cleanup job stubbed. |
| **`apps/api`** | Express + tRPC (20 routers). Hono bridged via Express adapter. Two parallel event systems (legacy BullMQ + core in-memory). Module routes have zero auth. |
| **`apps/web`** | Hardcoded routes, tRPC client. Support/audit pages call dead tRPC endpoints. Old plugin UI system is stubs. |
| **Permissions** | Three incompatible naming conventions. Module permissions declared but never enforced. |
| **Obsolete packages** | `plugin-sdk`, `plugin-cli`, `shared-types` — all replaced by new architecture. |
| **Dead code** | Root `src/lib/plugins/`, example plugins, 7 test scripts, abandoned `apps/api/src/modules/billing/`, `dump.rdb`, outdated docs. |

---

## Roadmap Overview

```
Phase 0  Safe Cleanup (dead code, stale files) .. 1 day
Phase 1  Harden Module Platform ................ 2-4 weeks
Phase 2  Ship Support & Audit E2E .............. 2-3 weeks
Phase 3  Revenue Path (5 modules) .............. 6-10 weeks
Phase 4  Secondary Modules ..................... 3-5 weeks
Phase 5  Frontend Shell + Final Cleanup ........ 3-4 weeks
Phase 6  Quality & Release Readiness ........... ongoing
```

---

## Phase 0: Safe Cleanup

Goal: remove dead code and stale files. Zero risk — none of this code is referenced by anything live.

### Issue 0.1: Delete Obsolete Packages

| Path | Reason |
|------|--------|
| `packages/plugin-sdk/` | Replaced by `@panel1/core` `defineModule()` contract |
| `packages/plugin-cli/` | CLI scaffolding for old plugin SDK |
| `packages/shared-types/` | Replaced by `packages/types/` |

- [x] Delete all three directories *(already absent in repo)*
- [x] Remove from `package.json` workspaces *(dropped `plugins/*`; packages not in tree)*
- [x] Remove any imports referencing these packages *(AdminDomains → local types)*

### Issue 0.2: Delete Dead Plugin Systems & Examples

| Path | Reason |
|------|--------|
| `src/lib/plugins/` (root-level) | Stale duplicate of `apps/api/src/lib/plugins/` |
| `plugins/example-admin-ui-plugin/` | Uses old `createPlugin()` SDK |
| `plugins/example-analytics-plugin/` | Uses old `createPlugin()` SDK |
| `apps/web/src/lib/marketplace/MarketplaceManager.ts` | 7KB unused marketplace code |

- [x] Delete all listed paths *(root `src/` / example plugins N/A; marketplace file removed; stub inlined in AdminPlugins)*
- [x] Verify no imports break

### Issue 0.3: Delete Stale Files

| Path | Reason |
|------|--------|
| `dump.rdb` | Redis dump committed to repo |
| `apps/api/tsconfig.tsbuildinfo` | Build artifact |
| `docs/TECHNICAL_DEBT.md` | Empty file (1 byte) |
| `apps/api/src/modules/billing/` | Abandoned module extraction attempt, conflicts with `lib/payments/` |
| `apps/api/src/scripts/test-*.ts` (7 files) | Manual test scripts, not automated tests |

- [x] Delete all listed paths *(not present; removed dead `NotificationPlugin` example; dropped broken npm scripts for missing scripts)*
- [x] Add `dump.rdb` and `*.tsbuildinfo` to `.gitignore` *(already present)*

### Issue 0.4: Delete Outdated Docs

| Path | Reason |
|------|--------|
| `docs/ARCHITECTURE.md` | Old doc contradicting root `ARCHITECTURE.md`. Says "tRPC", "pnpm", "Shadcn UI" |
| `docs/API_STANDARDS.md` | Written for tRPC era |
| `docs/PLUGIN_DEVELOPMENT.md` | Written for old SDK plugin system |
| `docs/RELEASE_CHECKLIST.md` | References old structure |
| `docs/SECURITY.md` | Partially valid but references old architecture |
| `docs/README.md` | Old docs readme |
| `docs/plugins/` | Plugin docs for old system |

- [x] Delete all listed paths *(already absent; `docs/` holds roadmap + planning notes)*
- [x] Keep `docs/` folder for new docs (this roadmap, etc.)

---

## Phase 1: Harden Module Platform

Goal: make `@panel1/core` production-capable before migrating revenue-critical domains.

### Issue 1.1: Shared Hono Auth/Tenant/Permission Middleware

**Why first**: Module routes are completely unprotected. Support and audit trust client-supplied `tenantId`/`userId` headers with zero verification.

**Current state**:
- tRPC auth: `trpc/context.ts` extracts Bearer token → `getSessionByToken()` → DB lookup joining sessions+users → returns `{ user, tenantId }`
- tRPC permission: `requirePermission()` middleware calls `permissionManager.hasPermission()` using async DB-backed path
- Hono auth: **does not exist anywhere** — zero middleware in `packages/core/`, `modules/support/`, `modules/audit/`
- Module routes read `x-tenant-id` from headers and `userId` from request body — trust-based

**Tasks**:
- [ ] Create `packages/core/src/middleware/auth.ts` — Hono middleware:
  - Extract Bearer token from Authorization header
  - Validate session via DB lookup (port the `getSessionByToken` logic from `lib/auth.ts` — joins `sessions` + `users` where `token = ? AND expiresAt >= now()`)
  - Set `user: { id, email, firstName, lastName, role, tenantId }` on Hono context via `c.set('user', ...)`
  - Set `tenantId` on Hono context from the authenticated user (never from headers)
  - Return 401 JSON response on missing/invalid/expired token
- [ ] Create `packages/core/src/middleware/requirePermission.ts` — Hono middleware factory:
  - `requirePermission('support.tickets.view')` returns middleware
  - Reads user from Hono context (`c.get('user')`)
  - Checks permission via `PermissionManager.hasPermission()` (the async DB-backed path)
  - Returns 403 JSON response on failure
  - Support OR semantics: `requirePermission('billing.invoices.view', 'billing.invoices.view_own')` — passes if user has any
- [ ] Create `packages/core/src/middleware/tenant.ts` — Hono middleware:
  - Reads `tenantId` from authenticated user context (never from headers/query)
  - Rejects requests where user has no tenant with 400
  - Makes `tenantId` available via `c.get('tenantId')`
- [ ] Create `packages/core/src/middleware/publicRoute.ts` — escape hatch for endpoints that don't need auth (e.g., webhook receivers, health checks)
- [ ] Export all middleware from `packages/core/src/index.ts`
- [ ] Update `apps/api/src/index.ts` to apply auth middleware globally to the Hono app that handles `/api/*` module routes
- [ ] Define Hono context type augmentation so `c.get('user')` and `c.get('tenantId')` are type-safe
- [ ] Write tests: valid token, expired token, missing token, wrong tenant, permission denied, permission granted, public route bypass

**Depends on**: nothing
**Blocks**: every module route is insecure without this

---

### Issue 1.2: Unify Permission Naming

**Why**: Three incompatible conventions. Must settle on one before building enforcement middleware.

**Current conventions**:

| Where | Convention | Example |
|-------|-----------|---------|
| `lib/auth/PermissionManager.initializePermissions()` | `resource.action` | `client.create`, `invoice.read_own` |
| `scripts/seed-rbac-data.ts` | `admin.resource.action` / `client.resource.action` | `admin.clients.view`, `client.support.tickets.create` |
| `defineModule({ permissions })` | `module.resource.action` | `support.tickets.view`, `audit.export` |

**Decision**: adopt `{module}.{resource}.{action}` as canonical. No backward compat needed.

**Tasks**:
- [ ] Document canonical permission convention in `ARCHITECTURE.md`: `{module}.{resource}.{action}`
  - Core/RBAC permissions: `core.users.view`, `core.clients.manage`, `core.tenants.manage`
  - Module permissions: `support.tickets.view`, `billing.invoices.create`, `audit.logs.export`
  - Standard actions: `view`, `create`, `update`, `delete`, `manage` (= all CRUD)
- [ ] Map all ~40 legacy permissions to canonical names (create a mapping table in the issue)
- [ ] Rewrite `seed-rbac-data.ts` to use canonical names
- [ ] Update `PermissionManager` to drop the hardcoded in-memory permission list (`initializePermissions()`)
  - Keep only the DB-backed `loadPermissions()` path
  - Permissions are seeded to DB, loaded at runtime, cached with TTL
- [ ] Update module `defineModule({ permissions })` declarations — verify support (10) and audit (3) use canonical form
- [ ] Update all frontend `withPermission()` HOC calls in `apps/web/` to use canonical names
- [ ] Wire module-declared permissions into the DB seed: during `bootModules()`, collect all module `permissions` arrays and ensure they exist in the `permissions` table
- [ ] Write migration script or seed update that drops old permission rows and inserts new canonical ones

**Depends on**: nothing
**Blocks**: 1.1 (requirePermission middleware checks these names)

---

### Issue 1.3: BullMQ-Backed EventBus

**Why**: Core EventBus is in-memory `Map<string, handler[]>` (42 LOC). Events lost on crash. Legacy `lib/events/EventService.ts` (217 LOC) already does BullMQ + Redis. Two parallel event systems running — must consolidate into one production-grade system.

**Current state**:
- `packages/core/src/events.ts`: In-memory pub/sub. `persistEvent` callback hook exists but is never used. `Promise.allSettled` dispatch. No BullMQ despite it being in `package.json` deps.
- `apps/api/src/lib/events/EventService.ts`: BullMQ queue on Redis. `emit`/`emitBatch`/`getStats`/`pause`/`resume`/`cleanOldJobs`. Default 3 retries with exponential backoff.
- Legacy `EventProcessor`: BullMQ worker on `events` queue. Routes events by prefix (`subscription.*`, `component.*`, `provisioning.*`, `billing.*`). Supports registering per-event handlers.

**Tasks**:
- [ ] Rewrite `packages/core/src/events.ts`:
  - Keep the `on(event, handler)` / `emit(event, payload)` API unchanged
  - Add `off(event, handler)` for unsubscribe
  - Persist events to DB table before dispatch (Kill Bill pattern):
    - `events` table: `id`, `eventName`, `payload` (jsonb), `status` (pending/processing/completed/failed/dead), `createdAt`, `processedAt`, `attempts`, `lastError`, `tenantId`
    - Events written in same DB transaction as the triggering operation when possible
  - Create BullMQ `Queue` for async dispatch
  - Create BullMQ `Worker` that:
    - Dequeues events
    - Calls all registered handlers via `Promise.allSettled`
    - Updates event status in DB
    - Retries failed handlers with exponential backoff (configurable per-event-type)
  - Dead-letter: after max retries, mark event as `dead` in DB (queryable for debugging)
  - Accept `EventBusOptions`: `{ redisUrl, maxRetries, backoffMs, concurrency, persistEvent? }`
- [ ] Add `start()` / `stop()` lifecycle methods
  - `start()`: creates BullMQ Worker, begins processing
  - `stop()`: gracefully drains in-flight events, closes Worker and Queue
- [ ] Add `getStats()` returning: pending count, processing count, failed count, dead count, events/minute
- [ ] Update `loader.ts` (`bootModules`) to:
  - Pass Redis config to EventBus constructor
  - Call `eventBus.start()` after all module `setup()` calls complete
  - Call `eventBus.stop()` during shutdown
- [ ] Add event schema to core (Drizzle table definition for `events`)
- [ ] Write integration tests:
  - emit → persist → worker processes → handler called
  - handler throws → retry → eventually succeeds
  - handler permanently fails → moves to dead-letter → queryable
  - stop() during processing → drains cleanly

**Depends on**: nothing
**Blocks**: 1.7 (legacy event system retirement)

---

### Issue 1.4: BullMQ-Backed JobScheduler

**Why**: Core `JobScheduler` is a dead stub (22 LOC — `register`, `list`, `clear`). Jobs are registered but never execute. Legacy `lib/jobs/JobScheduler.ts` (441 LOC) has full BullMQ + `node-cron` integration. Module jobs (support: 2, audit: 1) are registered but never fire.

**Current legacy job infrastructure**:
- `lib/jobs/JobScheduler.ts`: BullMQ queues per job type, `node-cron` for scheduling, DB job records in `scheduled_jobs` table, retry logic, queue stats
- `lib/jobs/JobProcessor.ts`: BullMQ Workers for subscription renewal (concurrency 5), invoice gen (3), payment retry (3), dunning (2)
- 7 provisioning queues via `ProvisioningManager`
- Cron schedules: daily renewal check, hourly payment retry, 6-hourly dunning, 30-min scheduled job sweep

**Tasks**:
- [ ] Rewrite `packages/core/src/jobs.ts`:
  - Keep `register(name, cron, handler, moduleName)` API
  - Add `JobSchedulerOptions`: `{ redisUrl, defaultRetries, defaultBackoff }`
  - On `start()`:
    - For each registered job, create a BullMQ repeatable job using the `cron` expression
    - Create a BullMQ `Worker` that routes jobs to their registered `handler` function
    - Track job execution: last run time, next run time, success/failure count, last error
  - On `stop()`:
    - Remove repeatable job schedules
    - Gracefully drain Worker
    - Close Queue
  - Support per-job config via extended `ctx.job()` signature:
    ```
    ctx.job(name, cron, handler, { maxRetries?, backoff?, timeout? })
    ```
  - Add `runNow(jobName)` method for manual trigger (admin "run now" button)
  - Add `listJobs()` returning all registered jobs with their status and last/next run times
- [ ] Update `loader.ts`:
  - Pass Redis config to JobScheduler constructor
  - Call `jobScheduler.start()` after all module `setup()` calls
  - Call `jobScheduler.stop()` during shutdown
- [ ] Write tests:
  - register job → start → cron fires → handler called
  - handler throws → retry with backoff
  - `runNow()` triggers immediate execution
  - `stop()` drains cleanly
  - `listJobs()` returns correct status

**Depends on**: nothing
**Blocks**: 2.1 (support jobs), 2.2 (audit jobs), 1.7 (legacy job retirement)

---

### Issue 1.5: Move Infrastructure Services to Core

**Why**: Real implementations exist in `apps/api/src/lib/` but modules can't access them. `ctx.logger` is bare `console.*`, `ctx.email` is undefined.

**Services to move** (all are good quality, production-ready code):

| Service | Source | Size | What it does |
|---------|--------|------|-------------|
| Error types | `lib/errors/index.ts` | 5KB | `Panel1Error` base + 11 concrete errors (Validation, Auth, NotFound, Payment, Provisioning, etc.) with correlationId, context, retry flags |
| Logger | `lib/logging/Logger.ts` | 4KB | Structured JSON logging, log levels, `child()` for scoped loggers, `logOperation()` timing helper, `Panel1Error` awareness |
| EmailService | `lib/email/EmailService.ts` + `index.ts` | 9KB | Nodemailer wrapper, batch send, mustache templates, health check, EventEmitter |
| EncryptionService | `lib/security/EncryptionService.ts` | 5KB | AES-256-GCM, encrypt/decrypt/isEncrypted, key generation |
| RetryManager | `lib/resilience/RetryManager.ts` | 10KB | Exponential backoff with jitter, circuit breaker (CLOSED/OPEN/HALF_OPEN), pre-built configs for payment/provisioning/DB |

**Tasks**:
- [ ] Move `lib/errors/index.ts` → `packages/core/src/errors.ts`
  - No changes needed — pure classes, no dependencies
- [ ] Move `lib/logging/Logger.ts` → `packages/core/src/logger.ts`
  - Remove singleton pattern, make constructor-based
  - Wire into `createModuleContext()`: each module gets a child logger prefixed `[module-name]`
  - Replace current `console.*` stub in `context.ts`
- [ ] Move `lib/email/EmailService.ts` → `packages/core/src/email.ts`
  - Remove singleton pattern
  - Accept config via `BootOptions` (SMTP host, port, from, etc.)
  - Wire into `createModuleContext()` so `ctx.email` is defined
- [ ] Move `lib/security/EncryptionService.ts` → `packages/core/src/encryption.ts`
  - Remove singleton pattern
  - Expose via `ctx.encryption` on ModuleContext
- [ ] Move `lib/resilience/RetryManager.ts` → `packages/core/src/resilience.ts`
  - Remove singleton pattern
  - Expose via `ctx.retry` on ModuleContext
- [ ] Update `@panel1/types` `ModuleContext` interface to include `email`, `encryption`, `retry` properties
- [ ] Update `packages/core/src/context.ts` to inject all services
- [ ] Update `packages/core/src/index.ts` barrel exports
- [ ] Delete original files from `apps/api/src/lib/` (errors, logging, email, security, resilience)
- [ ] Update remaining imports in `apps/api/` that reference old paths
- [ ] Verify existing module code (support/audit) still compiles

**Depends on**: nothing
**Blocks**: 2.1, 2.2 (modules need real logger, email, errors)

---

### Issue 1.6: Module Boot Lifecycle Hardening

**Why**: Current boot has no error isolation, no graceful shutdown, no health checks. One failing module aborts the entire system.

**Current state**:
- `bootModules()` iterates modules calling `setup()` — any throw aborts boot
- No `shutdown()` — only `DbManager.close()` exists
- `apps/api/src/index.ts` has ad-hoc shutdown: clears event bus, closes DB, stops legacy event processor + job processor separately
- No per-module health reporting
- `defineModule.ui` is ignored during boot — declarations never collected
- No optional `teardown()` hook on modules

**Tasks**:
- [ ] Add try/catch per module `setup()`:
  - Log error with the new Logger
  - Mark module as `failed` in boot result
  - Continue booting remaining modules (skip those that depend on the failed module)
- [ ] Add `BootResult.failedModules: Array<{ name: string, error: Error }>` field
- [ ] Add `BootResult.moduleUi: Map<string, ModuleUI>` collecting all `ui` declarations (needed for Phase 5 frontend shell)
- [ ] Add optional `teardown?: () => Promise<void>` to `ModuleDefinition`
- [ ] Create `shutdown()` function in loader that:
  1. Calls `jobScheduler.stop()` (stop accepting new jobs)
  2. Calls `eventBus.stop()` (drain in-flight events)
  3. Calls each module's `teardown()` in reverse boot order
  4. Calls `dbManager.close()`
  5. Resolves when everything is drained
- [ ] Add `health()` function returning per-module status:
  - `booted` / `failed` / `degraded`
  - Include event bus stats (pending, processing, failed)
  - Include job scheduler stats (active jobs, failed jobs)
- [ ] Update `apps/api/src/index.ts` shutdown handlers to use the new `shutdown()` function, removing all ad-hoc cleanup code
- [ ] Write tests:
  - Module A fails during setup → Module B (no dep on A) still boots
  - Module C depends on failed Module A → Module C skipped with clear error
  - `shutdown()` drains event bus and job scheduler before closing DB
  - `health()` returns correct status for booted, failed, and degraded modules

**Depends on**: 1.3, 1.4 (shutdown needs to stop event bus and job scheduler)

---

### Issue 1.7: Bridge and Retire Legacy Event/Job Systems

**Why**: Two parallel event buses + two parallel job schedulers = confusion and duplicate processing.

**Current dual systems**:
- Legacy: `EventService` (BullMQ) + `EventProcessor` (Worker routing by event prefix) + `JobProcessor` (Workers for 7+ queues) + `JobScheduler` (cron schedules)
- Legacy event routing: `subscription.*` → SubscriptionRenewalProcessor, `component.*` → ComponentLifecycleService, `provisioning.*` → ProvisioningProcessor, `billing.*` → InvoiceEventHandler/PaymentEventHandler
- Modular: `@panel1/core` EventBus + JobScheduler — now BullMQ-backed after 1.3/1.4

**Tasks**:
- [ ] Map every legacy event handler to determine which are still needed:
  - `subscription.*` handlers → needed until Phase 3 (subscriptions module migration)
  - `component.*` handlers → needed until Phase 3 (catalog/provisioning migration)
  - `provisioning.*` handlers → needed until Phase 3 (provisioning migration)
  - `billing.*` handlers → needed until Phase 3 (billing migration)
- [ ] Create temporary bridge: register legacy event handlers as core EventBus subscribers via `ctx.on()` in the boot sequence
  - This means legacy processors still run, but triggered through the new event bus instead of the old one
- [ ] Remove from `apps/api/src/index.ts`:
  - `eventProcessor.start()`
  - `eventService` initialization
  - `jobProcessor.initialize()`
  - `CatalogEventHandlers.initialize()`
  - `PaymentEventHandler.initialize()`
- [ ] Delete legacy files:
  - `lib/events/EventService.ts`
  - `lib/jobs/JobProcessor.ts`
  - `lib/jobs/JobScheduler.ts`
  - `lib/jobs/processors/EventProcessor.ts`
  - `lib/jobs/processors/SubscriptionRenewalProcessor.ts`
  - `lib/jobs/processors/ProvisioningProcessor.ts`
  - `lib/jobs/processors/SupportProcessor.ts`
- [ ] Verify no events are lost: compare legacy event routes with new bridge handlers
- [ ] Update imports in any file that references deleted modules

**Depends on**: 1.3, 1.4 (new systems must be working first)
**Blocks**: Phase 3 (clean module migration without legacy interference)

---

### Issue 1.8: Fix Duplicate DB Connection

**Why**: `apps/api/src/db/schema/index.ts` creates a second Drizzle `db` instance alongside `apps/api/src/db/index.ts`. Some code imports from one, some from the other.

**Tasks**:
- [ ] Remove the DB connection from `db/schema/index.ts` — keep it as a pure schema barrel export only
- [ ] Ensure all code imports `db` from `db/index.ts` (or from core's `DbManager` for module code)
- [ ] Verify no double-connection at runtime

**Depends on**: nothing

---

## Phase 2: Ship Support & Audit End-to-End

Goal: first fully credible modular slices — backend + frontend + auth + tests.

### Issue 2.1: Support Module Backend Completion

**Current state** (22 endpoints, 9 tables):
- Working: ticket CRUD + messages, auto-assignment (scoring algorithm), automation engine (7 action types), SLA profiles + due date calculation, KB articles (CRUD + search + view counting), categories, agents, automation rules
- **Stubbed**: both cron jobs (escalation check every 15min, auto-close daily 2am) only `console.log`
- **Stubbed**: `getSlaMetrics()` returns hardcoded `{ avgResponseTime: 0, ... }`
- **Partial**: `getSupportStats()` — totals work, but `ticketsByPriority` and `ticketsByCategory` return `{}`

**Tasks**:
- [ ] Apply auth middleware (from 1.1) to all support routes:
  - `GET /my-tickets` — authenticated user, scoped to their `clientId`
  - `GET /tickets`, `GET /tickets/:id`, `POST /tickets/:id/messages` — `support.tickets.view`
  - `POST /tickets`, `PATCH /tickets/:id/status`, `POST /tickets/:id/assign` — `support.tickets.manage`
  - `GET/POST /categories` — `support.categories.manage`
  - `GET/POST /sla/profiles`, `GET /sla/metrics` — `support.sla.manage`
  - `GET/POST /agents` — `support.agents.manage`
  - `GET/POST /automation/rules` — `support.automation.manage`
  - `GET /stats` — `support.stats.view`
  - `GET /kb/*` — `support.kb.manage` for admin, public access for published articles
- [ ] Implement `support-escalation-check` job (runs every 15 min):
  - Query tickets where `firstResponseDue < now()` and `firstResponseAt IS NULL`, or `resolutionDue < now()` and `resolvedAt IS NULL`
  - For each, look up the ticket's SLA profile escalation rules
  - Execute escalation: reassign, change priority, add internal note, emit `support.sla.breached`
  - Update ticket: set `escalated = true`, record escalation in metadata
- [ ] Implement `support-auto-close-stale` job (runs daily 2am):
  - Query tickets in `waiting_on_customer` status where `lastActivityAt < now() - configurable_days`
  - For each: change status to `closed`, add system message "Auto-closed due to inactivity"
  - Emit `support.ticket.closed` event
- [ ] Fix `getSlaMetrics()` — real DB aggregation:
  - Average first response time: `AVG(firstResponseAt - createdAt)` where `firstResponseAt IS NOT NULL`
  - Average resolution time: `AVG(resolvedAt - createdAt)` where `resolvedAt IS NOT NULL`
  - SLA compliance: `COUNT(firstResponseAt <= firstResponseDue) / COUNT(*)` as percentage
  - Breach count grouped by priority
- [ ] Fix `getSupportStats()`:
  - `ticketsByPriority`: `SELECT priority, COUNT(*) FROM support_tickets GROUP BY priority`
  - `ticketsByCategory`: `SELECT categoryId, COUNT(*) FROM support_tickets GROUP BY categoryId`
- [ ] Register event subscribers in `setup()`:
  - Optionally listen to `audit.logged` to cross-reference admin actions on tickets
- [ ] Replace `console.*` logging with `ctx.logger` (from 1.5)

**Depends on**: 1.1 (auth), 1.2 (permission names), 1.4 (job execution), 1.5 (logger)

---

### Issue 2.2: Audit Module Backend Completion

**Current state** (9 endpoints, 3 tables):
- Working: log event, query logs (multi-field filtering, pagination), resource audit trail, stats (real aggregation), export request creation (DB record only), export listing/status, filter options (distinct queries), cleanup (reads retention policies, deletes by cutoff)
- **Missing**: export file generation — creates pending record but no worker generates the file
- **Stubbed**: `audit-cleanup` cron job only `console.log`

**Tasks**:
- [ ] Apply auth middleware (from 1.1) to all audit routes:
  - `GET /logs`, `GET /stats`, `GET /trail/*`, `GET /filter-options` — `audit.view`
  - `POST /events` — service-to-service or `audit.view` (modules call this to log events)
  - `POST /exports`, `GET /exports`, `GET /exports/:id` — `audit.export`
  - `POST /cleanup` — `audit.cleanup`
- [ ] Implement export file generation:
  - Register a job via `ctx.job()` or trigger inline from `POST /exports`:
    - Query audit logs for the requested date range, resource types, action types
    - Generate output based on requested format:
      - JSON: stream records to file
      - CSV: headers + rows
      - PDF: basic tabular report (use existing PDF patterns from `InvoicePDFService` if applicable)
    - Store file on local filesystem (e.g., `data/exports/{exportId}.{format}`)
    - Update `audit_log_exports` record: `status = 'completed'`, `fileUrl`, `fileSize`, `recordCount`
    - On failure: `status = 'failed'`, store error
    - Emit `audit.export.completed` or `audit.export.failed`
  - Add `GET /exports/:id/download` endpoint to serve the file
  - Set `expiresAt` on export records, add cleanup of expired export files
- [ ] Implement `audit-cleanup` cron job (weekly Sunday 2am):
  - Call existing `cleanupOldLogs()` (already queries retention policies, deletes by cutoff)
  - Emit `audit.cleanup.completed` with `{ deletedCount }`
  - Also clean up expired export files from disk
- [ ] Add convenience for cross-module audit logging:
  - Ensure `IAuditService` is easily callable: `ctx.service<IAuditService>('audit').logEvent(...)`
  - Consider auto-audit Hono middleware for mutations: log all POST/PATCH/DELETE requests with before/after state
- [ ] Replace `console.*` logging with `ctx.logger`

**Depends on**: 1.1 (auth), 1.2 (permission names), 1.4 (job execution), 1.5 (logger)

---

### Issue 2.3: Support Admin UI

**Current state**:
- `SupportDashboard.tsx` calls `trpc.support.getSupportStats.useQuery()` — **dead**, no such tRPC router exists
- `SupportTickets.tsx` calls `trpc.support.getTickets.useQuery()` — **dead**
- Both pages expect joined relations (`ticket.client.user.firstName`, `ticket.assignedAgent.*`) that the module API doesn't return (it returns flat IDs)
- `SupportDashboard.tsx` uses `PluginSlot` (old stub system)
- No `modules/support/src/ui/` directory exists
- Three additional admin pages are placeholders in `AdminRoutes.tsx`: knowledge-base, automation, agents

**Tasks**:
- [ ] Create REST API client helpers for support module (plain `fetch` wrapper with auth token — orval comes in Phase 5):
  - `supportApi.listTickets(params)` → `GET /api/support/tickets`
  - `supportApi.getTicket(id)` → `GET /api/support/tickets/:id`
  - `supportApi.createTicket(data)` → `POST /api/support/tickets`
  - `supportApi.addMessage(ticketId, data)` → `POST /api/support/tickets/:id/messages`
  - `supportApi.updateStatus(ticketId, status)` → `PATCH /api/support/tickets/:id/status`
  - `supportApi.assignTicket(ticketId)` → `POST /api/support/tickets/:id/assign`
  - `supportApi.getStats()` → `GET /api/support/stats`
  - `supportApi.listCategories()` → `GET /api/support/categories`
  - `supportApi.listAgents()` → `GET /api/support/agents`
  - `supportApi.getSlaMetrics()` → `GET /api/support/sla/metrics`
- [ ] Rewrite `SupportDashboard.tsx`:
  - Fetch stats from support API
  - Fetch recent tickets (paginated, sorted by `createdAt desc`)
  - Show: open ticket count, avg response time, SLA compliance, tickets by priority chart
  - Remove `PluginSlot` usage
  - Handle loading/error/empty states properly
- [ ] Rewrite `SupportTickets.tsx`:
  - Paginated ticket list from support API
  - Filter by: status, priority, category, assigned agent
  - Search by ticket number or subject
  - Columns: ticket number, subject, client, status, priority, assigned to, created, last activity
  - Handle loading/error/empty states
- [ ] Create `SupportTicketDetail.tsx`:
  - Fetch ticket with messages from `/api/support/tickets/:id`
  - Message thread display (internal messages styled differently)
  - Reply form (with internal message toggle)
  - Status change controls (dropdown or buttons)
  - Assignment controls
  - SLA info display (due dates, compliance status)
  - Ticket metadata sidebar (client, category, priority, tags, created/updated dates)
- [ ] Create `SupportCategories.tsx`:
  - List categories from API
  - Create/edit category form (name, description, color, icon, parent category, default assignee)
- [ ] Update routes in `AdminRoutes.tsx`:
  - `/admin/support` → `SupportDashboard`
  - `/admin/support/tickets` → `SupportTickets`
  - `/admin/support/tickets/:id` → `SupportTicketDetail`
  - `/admin/support/categories` → `SupportCategories`
  - Keep placeholders for `/admin/support/knowledge-base`, `/admin/support/automation`, `/admin/support/agents` (can flesh out later)
- [ ] Update nav in `menuItems.tsx` — support section with correct paths
- [ ] Gate all pages with `withPermission()` using canonical permission names

**Depends on**: 2.1 (backend complete + authed), 1.2 (permission names)

---

### Issue 2.4: Audit Admin UI

**Current state**:
- `AdminAuditLogs.tsx` calls `trpc.audit.getLogs.useQuery()`, `trpc.users.list.useQuery()` — **dead**
- `apps/web/src/lib/audit/AuditLogger.ts` calls `trpc.audit.logEvent.mutate()`, `trpc.audit.getAuditTrail.query()`, `trpc.audit.exportAuditTrail.query()` — **dead**
- Data shape mismatch: page expects `log.user.firstName`, module returns flat `userId`

**Tasks**:
- [ ] Create REST API client helpers for audit module:
  - `auditApi.queryLogs(params)` → `GET /api/audit/logs`
  - `auditApi.getStats()` → `GET /api/audit/stats`
  - `auditApi.getTrail(resourceType, resourceId)` → `GET /api/audit/trail/:type/:id`
  - `auditApi.getFilterOptions()` → `GET /api/audit/filter-options`
  - `auditApi.requestExport(data)` → `POST /api/audit/exports`
  - `auditApi.listExports()` → `GET /api/audit/exports`
  - `auditApi.getExport(id)` → `GET /api/audit/exports/:id`
  - `auditApi.downloadExport(id)` → `GET /api/audit/exports/:id/download`
  - `auditApi.logEvent(data)` → `POST /api/audit/events`
- [ ] Rewrite `AdminAuditLogs.tsx`:
  - Fetch logs from audit API with pagination
  - Use `/api/audit/filter-options` to populate filter dropdowns
  - Filters: action type, resource type, date range, search
  - Columns: timestamp, action, resource type, resource ID, user, IP address
  - Expandable row detail showing old/new values diff
  - Remove dependency on `trpc.users.list` — display `userId` or add user name resolution to the audit API response
  - Handle loading/error/empty states
- [ ] Add export section to audit page (or separate `AuditExports.tsx`):
  - "Request Export" button → date range picker + format selector (JSON/CSV)
  - List existing exports with status (pending/processing/completed/failed)
  - Download link for completed exports
- [ ] Rewrite `lib/audit/AuditLogger.ts`:
  - Replace all tRPC calls with REST `fetch` calls to `/api/audit/events`
  - Keep convenience API: `logAuth(action, details)`, `logDataChange(resource, id, old, new)`, `logSystem(action, details)`
  - This utility is used by other frontend pages for client-side audit logging
- [ ] Update routes in `AdminRoutes.tsx` — `/admin/audit-logs` → rewritten `AdminAuditLogs`
- [ ] Gate with `withPermission('audit.view')`, export actions with `withPermission('audit.export')`

**Depends on**: 2.2 (backend complete + authed), 1.2 (permission names)

---

### Issue 2.5: Integration Tests for Support & Audit

**Why**: First modular slices need test coverage to serve as credible reference implementations.

**Tasks**:
- [ ] Create shared test utilities:
  - `createTestContext()` — sets up DB, boots core with test config, returns module context
  - `createAuthenticatedRequest(user, method, path, body?)` — builds Request with valid Bearer token
  - `seedTestData()` — creates tenant, admin user, client user with permissions
  - `waitForEvent(eventName, timeout)` — helper to await async event processing
  - `waitForJob(jobName, timeout)` — helper to await cron job execution
- [ ] Support integration tests:
  - **Ticket lifecycle**: create ticket → verify DB record + `support.ticket.created` event → add message → verify message stored → assign → verify assigned → change status to resolved → verify `support.ticket.resolved` event → close
  - **Auto-assignment**: create ticket with category that has assignment rules → verify assigned to correct agent based on workload/availability/skills scoring
  - **SLA**: create ticket with SLA profile → verify `firstResponseDue` and `resolutionDue` calculated → simulate time passing SLA → run escalation job → verify `support.sla.breached` event + escalation actions
  - **Automation**: create automation rule (e.g., "if priority=critical then assign to agent X") → create matching ticket → verify automation action executed
  - **KB**: create article → search by keyword → verify found → increment view count → verify count updated
  - **Auth enforcement**: unauthenticated request → 401, user without `support.tickets.view` → 403, client can only see own tickets via `/my-tickets`
- [ ] Audit integration tests:
  - **Log + query**: log event → query with filters → verify in results
  - **Resource trail**: log multiple events for same resource → query trail → verify all returned in chronological order
  - **Stats**: log events with different action types → get stats → verify aggregation correct
  - **Export**: request export → verify job processes → file exists on disk → download → verify content matches queried data
  - **Cleanup**: insert logs with old timestamps + recent timestamps → run cleanup → old deleted, recent preserved → verify count
  - **Auth enforcement**: unauthenticated → 401, user without `audit.export` → 403 on export endpoints

**Depends on**: 2.1, 2.2, 2.3, 2.4

---

## Phase 3: Revenue Path

Goal: migrate 5 core business domains into vertical-slice modules. Each = full vertical slice (schema + service + Hono routes + admin UI + delete legacy tRPC router + delete legacy lib code).

Order: catalog → billing → payments → subscriptions → provisioning (upstream → downstream).

### Issue 3.1: `modules/catalog/`

**Source files**: `lib/catalog/` (4 files, 48KB), `lib/components/` (2 files, 23KB), `routers/catalog.ts`, `routers/components.ts`, `routers/plans.ts`, `db/schema/catalog.ts`, `db/schema/componentProviders.ts`

**Tables**: components, component_providers, products, product_components, billing_plans, plan_components (6 tables)

**Services**: ProductService, ComponentDefinitionService, ComponentProviderRegistry, CatalogEventHandlers, ComponentLifecycleService, ComponentManagementService

**Frontend**: CatalogDashboard, ProductsManagement, ComponentRegistrationManagement, ProductStorePage, CartPage, CheckoutPage, CheckoutSuccessPage

### Issue 3.2: `modules/billing/`

**Source files**: `lib/invoice/` (7 files, 37KB), `lib/dunning/` (1 file, 12KB), `routers/invoices.ts`, `db/schema/invoices.ts`, `db/schema/invoice-items.ts`, `db/schema/invoice-counters.ts`, `db/schema/dunning-attempts.ts`

**Tables**: invoices, invoice_items, invoice_counters, dunning_attempts (4 tables)

**Services**: InvoiceNumberService, InvoicePDFService, InvoiceEmailService, TaxCalculationService, ComponentInvoiceService, InvoiceEventHandler, DunningManager, DunningEmailService

**Business flows**: invoice generation (from subscription renewal or manual), payment processing trigger, dunning campaigns (3 strategies: default/gentle/aggressive, day-offset scheduling)

**Frontend**: AdminBilling, AdminInvoices, ClientInvoices

### Issue 3.3: `modules/payments/`

**Source files**: `lib/payments/` (7 files, 35KB), `routers/payment-gateways.ts`, `db/schema/payments.ts`, `db/schema/payment-gateways.ts`

**Tables**: payments, payment_attempts, payment_gateway_configs (3 tables)

**Services**: PaymentService, PaymentGatewayService, PaymentGatewayManager, PaymentEventHandler, StripeGateway

**Implements**: `IPaymentGateway` interface from `@panel1/types`

**Events**: `payment.initiated`, `payment.succeeded`, `payment.failed`, `payment.refunded`

**Frontend**: AdminPaymentGateways

### Issue 3.4: `modules/subscriptions/`

**Source files**: `lib/subscription/` (2 files, 45KB), `routers/subscriptions.ts`, `db/schema/subscriptions.ts`, `db/schema/subscription-components.ts`, `db/schema/subscription-state-changes.ts`

**Tables**: subscriptions, subscription_components, subscribed_components, subscription_state_changes (4 tables)

**Services**: SubscriptionService (state machine, renewal, cancellation, trial handling)

**Cross-module events**: subscribes to `payment.succeeded` → activate, `payment.failed` → increment failures → PAST_DUE

**Frontend**: AdminSubscriptions, ClientSubscriptions

### Issue 3.5: `modules/provisioning/`

**Source files**: `lib/provisioning/` (4+ files, 25KB), `routers/provisioning.ts`, `db/schema/provisioning.ts`

**Tables**: provisioning_providers, service_instances, provisioning_tasks (3 tables)

**Services**: ProvisioningManager, CpanelPlugin, CpanelAdapter, ProvisioningProcessor

**Implements**: `IProvisioner` interface from `@panel1/types`

**Cross-module events**: subscribes to `subscription.activated` → provision

**Frontend**: AdminProvisioning

### Issue 3.6: Per-Module DB Schema Ownership

- Move schema files from `db/schema/*.ts` into respective `modules/*/src/schema.ts`
- Rename tables to `{module}_tablename` convention where appropriate
- Keep core tables (users, clients, tenants, roles, sessions, permissions) in `packages/core/` or `apps/api/`
- Implement per-module migration runner in `DbManager`
- Handle cross-module FKs: subscriptions→plans, invoices→subscriptions, payments→invoices+subscriptions, service_instances→subscriptions

---

## Phase 4: Secondary Modules

### Issue 4.1: `modules/domains/`
Source: `lib/domains/` (3 files, 32KB), `lib/plugins/domain/`. Tables: domains, dns_zones, dns_records, domain_operations (4). Implements `IRegistrar` from `@panel1/types`.

### Issue 4.2: `modules/ssl/`
Source: `lib/ssl/` (2 files, 22KB), `lib/plugins/ssl/`. Tables: ssl_certificates, ssl_certificate_operations, ssl_validation_records (3).

### Issue 4.3: Enhance `modules/audit/`
Subscribe to events from all migrated modules for automatic audit logging. Auto-audit middleware.

### Issue 4.4: Enhance `modules/support/`
SLA enforcement with real escalation. Ticket automation rules. Knowledge base content management.

---

## Phase 5: Frontend Shell + Final Cleanup

### Issue 5.1: Module Manifest Endpoint
`GET /api/modules/manifest` — returns active modules with `ui` declarations.

### Issue 5.2: Dynamic Route + Nav Building
Replace hardcoded `AdminRoutes.tsx` (160+ lines) and `menuItems.tsx`. Build from module manifest.

### Issue 5.3: Replace tRPC with orval-Generated Client
Aggregate OpenAPI specs at `/api/docs`. Configure orval. Generate React Query hooks. Remove tRPC deps.

### Issue 5.4: Replace Express with Hono
Remove Express from `apps/api`. Hono as sole HTTP server. Delete Express-to-Hono bridge hack.

### Issue 5.5: Delete All Legacy Code
- `apps/api/src/lib/plugins/` (internal PluginManager, BasePlugin, domain/ssl/provisioning/support sub-plugins)
- `apps/web/src/lib/plugins/` (frontend PluginManager, PluginLoader, PluginRegistry, RouteManager, UISlotManager)
- All remaining `apps/api/src/lib/` directories
- All remaining `apps/api/src/routers/` tRPC routers
- `apps/api/src/trpc/` directory
- `apps/web/src/api/trpc.ts`, `providers/TRPCProvider.tsx`
- `apps/web/src/lib/billing/ProrationCalculator.ts` (business logic in frontend)
- `apps/web/src/lib/events/EventEmitter.ts`
- `apps/web/src/pages/LandingPage.tsx` (30KB marketing page with "Built with Bolt.new")
- Remove tRPC deps from all `package.json` files
- Remove Express deps from `apps/api/package.json`
- Clean up `README.md`

---

## Phase 6: Quality & Release Readiness

### Issue 6.1: Module Integration Test Suite
Each module has end-to-end tests covering core workflows.

### Issue 6.2: Smoke Tests
Sign-in → browse catalog → purchase → payment → active service → support ticket → audit trail.

### Issue 6.3: Alpha Release Checklist
Seed data, environment setup docs, deployment guide, known limitations.

---

## Dependency Graph

```
Phase 0 (cleanup) ──── no dependencies, safe to do anytime
       │
       ▼
1.1 Auth Middleware ─────────┐
1.2 Permission Naming ───────┤
1.3 EventBus (BullMQ) ───────┼── 1.6 Boot Lifecycle ──┐
1.4 JobScheduler (BullMQ) ───┤                         │
1.5 Infra Services ──────────┤   1.7 Retire Legacy ────┘
1.8 Fix Duplicate DB ────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
           2.1 Support Backend       2.2 Audit Backend
                 │                         │
                 ▼                         ▼
           2.3 Support UI            2.4 Audit UI
                 │                         │
                 └────────────┬────────────┘
                              ▼
                       2.5 Integration Tests
                              │
                              ▼
          Phase 3 (Revenue Path) → Phase 4 → Phase 5 → Phase 6
```

---

## Cross-Module FK Reference Map

Key coupling points to handle carefully during Phase 3 schema migration:

```
tenants ← referenced by almost every table (multi-tenancy scope)
users   ← referenced by clients, invoices, tickets, audit, etc.
clients ← invoices, payments, subscriptions, tickets, domains, ssl
subscriptions ← invoices, payments, service_instances, domains, dunning
components ← subscribed_components, product_components
```

Modules that own tables with FKs to other module's tables must use `import type` only and resolve references via service calls at runtime, not direct DB joins across module boundaries.
