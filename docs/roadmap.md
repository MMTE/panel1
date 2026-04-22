# Panel1 Migration Roadmap

> Last updated: March 24, 2026
> Breaking changes: allowed (no public release yet)
> Architecture reference: [`ARCHITECTURE.md`](../ARCHITECTURE.md) (authoritative, root-level)

---

## Progress Tracker

| Phase | Progress | Next Action |
|-------|----------|-------------|
| **Phase 0** | ✅ 100% | — |
| **Phase 1** | ✅ 100% | — |
| **Phase 2** | ✅ ~100% | 2.2 audit backend + 2.5 integration tests done; Phase 3 Revenue Path next |
| **Phase 3–6** | 🔄 ~15% | 3.1 catalog module + REST + web rewire done; 3.2–3.6 next |

---

## Current State

| Component | Status |
|-----------|--------|
| **Database** | Single connection pool (`max: 10`). Schema barrel is pure re-exports. ✅ |
| **`packages/core`** | Loader, services, filters, events (BullMQ + outbox), jobs (BullMQ + cron fallback), middleware (auth/tenant/perm), errors, logger, email, encryption, resilience — all present. `createEmailService()` / `createEncryptionService()` factories (no singletons in core). `ctx.email`, `ctx.encryption`, `ctx.retry` all wired via `hostInfra`. |
| **`packages/types`** | `ModuleContext` has `email?: EmailTransport`, `encryption?: EncryptionPort`, `retry?: RetryPort`. `ModuleJobOptions` includes `timeout`. |
| **`modules/audit`** | 9 Hono endpoints, 3 tables. JSON/CSV exports on disk, download route, weekly `audit-cleanup` job (`runWeeklyMaintenance`). |
| **`modules/support`** | 22 Hono endpoints, 9 tables. **2.1:** SLA metrics + stats grouping + escalation + stale-close crons implemented. Legacy `apps/api` support paths already absent (no extra delete). |
| **`apps/api`** | Express + tRPC + Hono. **1.7 done:** legacy `EventService` forwards to core `EventBus`; `EventProcessor` + legacy `JobScheduler` removed; operational Bull queues in `OperationalQueues.ts`; legacy crons registered on core `JobScheduler` via `legacyBridge.ts`. `JobProcessor` + renewal/provisioning workers retained. |
| **`apps/web`** | Hardcoded routes, tRPC client. Support pages rewired to REST (`supportApi`), audit pages rewired to REST (`auditApi`). `AuditLogger` uses REST. Remaining pages still tRPC. |
| **Permissions** | Canonical `{module}.{resource}.{action}`. `PermissionManager` loads roles from DB (async `getAvailableRoles()`), no hardcoded permission list. `seedModulePermissionsFromDefinitions()` upserts module-declared perms after boot + `clearCache()`. `migrate-permissions.ts` script exists for legacy renames. |

---

## Phase 0: Safe Cleanup ✅ COMPLETE

Obsolete packages, dead plugin systems, stale files, outdated docs — all cleaned.

---

## Phase 1: Harden Module Platform

Goal: make `@panel1/core` production-capable before migrating revenue-critical domains.

### Issue 1.1: Shared Hono Auth/Tenant/Permission Middleware ✅ COMPLETE

All middleware created and wired to `/api/*` routes. Tests passing.

- `packages/core/src/middleware/` — `auth.ts`, `tenant.ts`, `requirePermission.ts`, `public.ts`
- `apps/api/src/hono/security.ts` — wires to `PermissionManager` + `getSessionByToken()`

---

### Issue 1.2: Unify Permission Naming ✅ COMPLETE

- [x] Convention documented in `ARCHITECTURE.md`: `{module}.{resource}.{action}`
- [x] `seed-rbac-data.ts` rewritten with canonical names (`core.dashboard.view`, `clients.clients.view`, `billing.invoices.view`, etc.)
- [x] Module `defineModule({ permissions })` use canonical form (support: 11 perms incl. `support.dashboard.view`, audit: 3)
- [x] `PermissionManager.getAvailableRoles()` async, reads from `roles` table (no hardcoded enum)
- [x] `PermissionManager.clearCache()` — cache invalidation after seeding
- [x] `initializePermissions()` hardcoded list removed
- [x] `seedModulePermissionsFromDefinitions()` in `apps/api/src/lib/permissions/` — upserts module-declared perms after `bootModules()`
- [x] Boot sequence: `bootModules()` → `seedModulePermissionsFromDefinitions(moduleDefs)` → `permissionManager.clearCache()`
- [x] `apps/api/src/scripts/migrate-permissions.ts` — legacy name → canonical renames (FK-safe via `permissions.id`)
- [x] Frontend `AdminRoutes` uses canonical `permissionId`s
- [x] `permissions` tRPC router updated — all `getAvailableRoles` usages await async; `getRoleDescription` includes `SUPER_ADMIN`

---

### Issue 1.3: BullMQ-Backed EventBus ✅ COMPLETE

`packages/core/src/events.ts` — 254 LOC, production-grade:
- BullMQ Queue + Worker with configurable concurrency, retries, exponential backoff
- `EventOutboxPort` interface for durable DB persistence (Kill Bill pattern)
- `on()` / `off()` / `emit()` / `start()` / `stop()` / `getStats()`
- In-memory fallback when Redis unavailable
- Strict/lenient handler modes
- `apps/api/src/lib/core/eventOutbox.ts` wires outbox to Drizzle
- Tests: `packages/core/src/__tests__/events.test.ts`

---

### Issue 1.4: BullMQ-Backed JobScheduler ✅ COMPLETE

`packages/core/src/jobs.ts` — 301 LOC, production-grade:
- BullMQ repeatables for cron, `node-cron` fallback
- `register()` / `start()` / `stop()` / `runNow()` / `listJobs()`
- Per-job `maxRetries`, `backoffMs`, `timeout` options
- Execution metrics (success/failure counts, last run, next run, last error)
- Tests: `packages/core/src/__tests__/jobs.test.ts`

---

### Issue 1.5: Move Infrastructure Services to Core ✅ COMPLETE

All services in `packages/core/src/`, factory-based (no singletons in core):
- [x] `errors.ts` — `Panel1Error` base + concrete error types
- [x] `logger.ts` — structured JSON, `child()` scoping, `createModuleLogger()` wired in context
- [x] `email.ts` — nodemailer wrapper, batch, templates + `createEmailService()` factory
- [x] `encryption.ts` — AES-256-GCM + `createEncryptionService()` factory
- [x] `resilience.ts` — `RetryManager` (retry + circuit breaker with preset configs)
- [x] `@panel1/types`: `EncryptionPort`, `RetryPort`, `RetryConfig` interfaces on `ModuleContext`
- [x] `BootOptions.hostInfra` — `{ email, encryption, retry }` forwarded to every module context
- [x] `apps/api/src/index.ts`: `initializeEmailService()` before boot; `hostInfra` wires SMTP adapter, `encryptionService`, `RetryManager`
- [x] `apps/api/src/lib/email/EmailService.ts` + `lib/security/EncryptionService.ts` — thin re-exports using `create*()` from core

**Deferred cleanup** (low priority, does not block anything):
- [ ] Delete duplicate wrappers under `apps/api/src/lib/` (errors, logging, etc.) after full import audit
- [ ] Point all remaining `apps/api/` imports at `@panel1/core` directly

---

### Issue 1.6: Module Boot Lifecycle Hardening ✅ COMPLETE

`packages/core/src/loader.ts`:
- [x] Topological sort with cycle detection
- [x] Per-module try/catch — failed module doesn't crash boot
- [x] `failedModules` array in `BootResult`, dependent modules skipped
- [x] `moduleUi` map collected during boot
- [x] Optional `teardown()` hook on `ModuleDefinition`
- [x] `shutdown()` — jobs → events → teardowns (reverse order) → DB close
- [x] `health()` — per-module status + event stats + job stats
- [x] SIGTERM/SIGINT handlers in `apps/api/src/index.ts`
- [x] Tests: `packages/core/src/__tests__/loader.test.ts`

---

### Issue 1.7: Bridge and Retire Legacy Event/Job Systems ✅ COMPLETE

**Why**: Dual event buses + dual job schedulers running simultaneously. Consolidated onto core.

**Delivered**:
- [x] `apps/api/src/lib/core/appRuntime.ts` — `setApplicationEventBus` / `getApplicationEventBus` for legacy `emit` facade
- [x] `apps/api/src/lib/core/legacyBridge.ts` — before core `JobScheduler.start()`: init `OperationalQueues`, `jobProcessor.initialize()`, `PaymentEventHandler.attachToEventBus()`, plugin log handlers, register legacy crons on **core** `JobScheduler`
- [x] `packages/core` `bootModules({ beforeJobSchedulerStart })` hook
- [x] `EventService` — thin forwarder to core `EventBus` (no second BullMQ `events` queue)
- [x] Removed: `lib/jobs/JobScheduler.ts`, `lib/jobs/processors/EventProcessor.ts`
- [x] Renamed/replaced with: `lib/jobs/OperationalQueues.ts` (subscription/invoice/payment/dunning/provisioning Bull queues; **no** duplicate node-cron — crons bridged to core)
- [x] **Kept**: `JobProcessor`, `SubscriptionRenewalProcessor`, provisioning workers
- [x] `index.ts` — dropped `eventProcessor`, duplicate `jobProcessor` / `PaymentEventHandler` / `CatalogEventHandlers` init (bridge handles)

**Depends on**: 1.3 ✅, 1.4 ✅, 1.5 ✅, 1.6 ✅

---

### Issue 1.8: Fix Duplicate DB Connection ✅ COMPLETE

- [x] `apps/api/src/db/index.ts` — single connection, `max: 10`
- [x] `apps/api/src/db/schema/index.ts` — pure re-export barrel with warning comment
- [x] No code imports `db` from `db/schema/`

---

### Phase 1 Dependency Graph

```
1.1 Auth Middleware ─────────────────────────────────────────  ✅ DONE
1.2 Permission Naming ───────────────────────────────────────  ✅ DONE
1.3 EventBus (BullMQ) ──────────────────────────────────────  ✅ DONE
1.4 JobScheduler (BullMQ) ──────────────────────────────────  ✅ DONE
1.5 Infra Services ─────────────────────────────────────────  ✅ DONE
1.6 Boot Lifecycle ─────────────────────────────────────────  ✅ DONE
1.8 Fix Duplicate DB ───────────────────────────────────────  ✅ DONE
                         │
                         ▼
              1.7 Bridge & Retire Legacy ──────────────────  ✅ DONE
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
     Support (#8)   Catalog (#9)  Domains+SSL (#10)  ←── Leaf migrations
```

**NEXT**: Phase 2 (support/audit E2E)

---

## Phase 2: Ship Support & Audit End-to-End

Goal: first fully credible modular slices — backend + frontend + auth + tests.

### Issue 2.1: Support Module Backend Completion ✅ COMPLETE

**Current** (22 endpoints, 9 tables): ticket CRUD + messages, auto-assignment, automation engine, SLA profiles, KB articles, categories, agents.

**Remaining**:
- [x] Implement `support-escalation-check` job (15min): query overdue tickets, execute SLA escalation rules, emit `support.sla.breached`
- [x] Implement `support-auto-close-stale` job (daily 2am): close `WAITING_CUSTOMER` tickets past threshold (`staleTicketCloseDaysAfterLastActivity`, default 14d)
- [x] Fix `getSlaMetrics()` — real DB aggregation (avg response time, resolution time, compliance %, breaches, at-risk)
- [x] Fix `getSupportStats()` — `ticketsByPriority` and `ticketsByCategory` grouping
- [x] Delete old support code from `apps/api/src/` — **already removed** in tree (no `lib/support/`, `routers/support.ts`, etc.)
- [x] Remove from barrel files — **no support exports** in `apps/api` schema/router barrels (nothing to remove)
- [x] Replace `console.*` with `ctx.logger` — support module uses `ctx.logger` only

**Depends on**: 1.2 ✅, 1.4 ✅, 1.5 ✅ — **all prerequisites met**

---

### Issue 2.2: Audit Module Backend Completion ✅ COMPLETE

**Delivered**:
- [x] Export file generation (JSON/CSV, disk under `AUDIT_EXPORT_DIR`, `processExportJob`, status tracking)
- [x] `GET /exports/:id/download` (stream)
- [x] `audit-cleanup` weekly cron → `runWeeklyMaintenance()` (retention + expired export purge)
- [x] API email helpers use `logger` (no `console.*` in `lib/email/index.ts` send path)

**Depends on**: 1.2 ✅, 1.4 ✅, 1.5 ✅ — **all prerequisites met**

---

### Issue 2.3: Support Admin UI ✅ COMPLETE

**Delivered**:
- [x] `apps/web/src/api/supportApi.ts` — REST client (getStats, getSlaMetrics, listTickets, getTicket, createTicket, addMessage, updateTicketStatus, assignTicket, listCategories, createCategory)
- [x] `SupportDashboard.tsx` — SLA snapshot, real stats, links to tickets & categories
- [x] `SupportTickets.tsx` — search/filters, rows link to detail, new-ticket modal
- [x] `SupportTicketDetail.tsx` — thread, reply/internal note, status select, auto-assign
- [x] `SupportCategories.tsx` — list + create (name, color, description)
- [x] `AdminRoutes.tsx` — `support/tickets/:ticketId`, `support/categories`; gated with `support.tickets.view` / `support.tickets.manage`
- [x] `menuItems.tsx` — Support → Categories (`support.tickets.manage`)

**Depends on**: 2.1 ✅, 1.2 ✅

---

### Issue 2.4: Audit Admin UI ✅ COMPLETE

**Delivered**:
- [x] `apps/web/src/api/auditApi.ts` — REST client (queryLogs, getFilterOptions, getStats, logEvent, createExport, listExports, getExportStatus, waitForExportReady, downloadExportBlob)
- [x] `apps/web/src/api/http.ts` — `fetchBlob()` for file downloads
- [x] `AdminAuditLogs.tsx` — filters from API, resource filter, stats cards, expandable rows (metadata + old/new JSON), exports block
- [x] `AuditLogger.ts` — REST via `auditApi.logEvent` (tRPC dropped)
- [x] View gated with `audit.logs.view`; export UI gated with `audit.logs.export` via `<Can>`

**Depends on**: 2.2 ✅, 1.2 ✅

---

### Issue 2.5: Integration Tests for Support & Audit ✅ COMPLETE

**Delivered** (`apps/api/src/__tests__/integration/`):
- [x] Shared helpers: `createTestContext()`, `createAuthenticatedRequest()`, `seedTestData()`, `deleteSeedData()`, schema probes (`supportModuleTablesExist` / `auditModuleTablesExist`)
- [x] Support: stats, SLA metrics, automation rules list, ticket create → get → message, `support-escalation-check` job, 401/403 (CLIENT vs SUPER_ADMIN). *Skipped if support tables not migrated.*
- [x] Audit: log event, query, JSON export + download, `audit-cleanup` job, cleanup 403, 401/403. *Requires `audit_logs` table.*

**Depends on**: 2.1–2.4

---

## Phase 3: Revenue Path

Goal: migrate 5 core business domains into vertical-slice modules.
Order: catalog → billing → payments → subscriptions → provisioning (upstream → downstream).

### Issue 3.1: `modules/catalog/` — ✅ scaffold + Hono + REST client + legacy tRPC removed (Mar 2026)
**Delivered**: `@panel1/mod-catalog` (`schema`, `CatalogService`, `routes.ts`, permissions seed-aligned). Host `catalogRuntime.ts` wires `ComponentProviderRegistry`, `ComponentManagementService`, `ComponentLifecycleService` after `initializeServices()`. Public storefront: `GET /api/catalog/public/products` (auth/tenant skipped for `/api/catalog/public/*`). Legacy `plans` table: `/api/catalog/legacy-plans*`. Subscribed instance ops (ex–`components` router): `/api/catalog/instances/*`. **Removed**: `routers/catalog.ts`, `components.ts`, `plans.ts`; `lib/catalog/*` except `ComponentProviderRegistry` + `catalogRuntime`; `apps/web` catalog/plans/components pages use `catalogApi.ts` + React Query. **Deferred (3.6)**: Drizzle tables still in `apps/api/src/db/schema/` (module ships parallel schema merge for relational queries).
**Source (historical)**: was `lib/catalog/`, `lib/components/` lifecycle, three tRPC routers, `db/schema/catalog.ts` + `componentProviders.ts`.

### Issue 3.2: `modules/billing/`
Source: `lib/invoice/` (7 files, 37KB), `lib/dunning/` (1 file, 12KB), `routers/invoices.ts`, schema files. Tables: 4. Services: InvoiceNumberService, InvoicePDFService, TaxCalculationService, DunningManager. Frontend: AdminBilling, AdminInvoices, ClientInvoices.

### Issue 3.3: `modules/payments/`
Source: `lib/payments/` (7 files, 35KB), `routers/payment-gateways.ts`, schema files. Tables: 3. Services: PaymentService, PaymentGatewayManager, StripeGateway. Implements `IPaymentGateway`. Frontend: AdminPaymentGateways.

### Issue 3.4: `modules/subscriptions/`
Source: `lib/subscription/` (2 files, 45KB), `routers/subscriptions.ts`, schema files. Tables: 4. Services: SubscriptionService (state machine). Cross-module: `payment.succeeded` → activate. Frontend: AdminSubscriptions, ClientSubscriptions.

### Issue 3.5: `modules/provisioning/`
Source: `lib/provisioning/` (4+ files, 25KB), `routers/provisioning.ts`, schema. Tables: 3. Services: ProvisioningManager, CpanelAdapter. Implements `IProvisioner`. Cross-module: `subscription.activated` → provision. Frontend: AdminProvisioning.

### Issue 3.6: Per-Module DB Schema Ownership
Move schema files from `db/schema/*.ts` into respective modules. Keep core tables in `apps/api/`. Handle cross-module FKs via service calls.

---

## Phase 4: Secondary Modules

### Issue 4.1: `modules/domains/`
Source: `lib/domains/` (3 files, 32KB), `lib/plugins/domain/`. Tables: 4. Implements `IRegistrar`.

### Issue 4.2: `modules/ssl/`
Source: `lib/ssl/` (2 files, 22KB), `lib/plugins/ssl/`. Tables: 3.

### Issue 4.3: Enhance `modules/audit/`
Auto-audit middleware, subscribe to events from all migrated modules.

### Issue 4.4: Enhance `modules/support/`
SLA enforcement with real escalation, automation rules, KB content management.

---

## Phase 5: Frontend Shell + Final Cleanup

### Issue 5.1: Module Manifest Endpoint
`GET /api/modules/manifest` — active modules with `ui` declarations.

### Issue 5.2: Dynamic Route + Nav Building
Replace hardcoded `AdminRoutes.tsx` and `menuItems.tsx`. Build from manifest.

### Issue 5.3: Replace tRPC with orval-Generated Client
Aggregate OpenAPI at `/api/docs`. Generate React Query hooks. Remove tRPC deps.

### Issue 5.4: Replace Express with Hono
Hono as sole HTTP server. Delete Express-to-Hono bridge.

### Issue 5.5: Delete All Legacy Code
All remaining `lib/`, `routers/`, `trpc/`, plugin stubs, tRPC/Express deps.

---

## Phase 6: Quality & Release Readiness

### Issue 6.1: Module Integration Test Suite
### Issue 6.2: Smoke Tests
Sign-in → catalog → purchase → payment → active service → support ticket → audit trail.
### Issue 6.3: Alpha Release Checklist

---

## Cross-Module FK Reference Map

```
tenants ← referenced by almost every table (multi-tenancy scope)
users   ← referenced by clients, invoices, tickets, audit, etc.
clients ← invoices, payments, subscriptions, tickets, domains, ssl
subscriptions ← invoices, payments, service_instances, domains, dunning
components ← subscribed_components, product_components
```

Modules with FKs to other module tables must use `import type` only and resolve via service calls at runtime.
