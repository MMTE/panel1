# `apps/api/` Boot Flow & Legacy Bridge Audit

> **Purpose**: map every subsystem that starts at `apps/api` boot today so mission
> workers know exactly which wire to cut when a domain (billing, payments,
> subscriptions, provisioning, domains, ssl) migrates into `modules/*`.
>
> **Repo**: `/root/projects/panel1` &nbsp; · &nbsp; **Scope**: read-only.
>
> **Roadmap anchors**: 1.7 bridge retirement (done but still runtime-active),
> 3.2–3.6 revenue path + schema ownership, 4.1–4.2 secondary modules, 5.1–5.5
> final shell.

---

## 1. Ordered boot sequence (`apps/api/src/index.ts`)

Top-level side-effects happen at module import; runtime boot happens inside
`app.listen()`’s async callback. In order:

| # | Step | Source | Notes |
|---|------|--------|-------|
| 0 | `dotenv` loaded | `config.ts` | via import of `modules`, `getDatabaseUrl`, `getRedisOptions` |
| 1 | Instantiate `RetryManager` | `@panel1/core` | passed as `hostInfra.retry` |
| 2 | Express app + helmet + CORS allowlist | `index.ts` | tRPC needs express |
| 3 | `GET /health` | `index.ts` | static response |
| 4 | `/trpc` Express middleware | `createExpressMiddleware({ router: appRouter, createContext })` | **legacy**, still live |
| 5 | `app.listen()` fires `async` callback ↓ | | all boot from here on |
| 6 | `await initializeEmailService()` | `lib/email` | SMTP warm-up (used by `hostInfra.email` adapter) |
| 7 | `await bootModularSystem()` → `bootModules(...)` | see §2 | the main modular slice |
| 8 | `bootResult.eventBus.emit('app.started', …)` | | first core-bus event |
| 9 | `await initializeServices()` | see §3 | the legacy singleton world |
| 10 | `console.log('Panel1 API Server ready')` | | |

**Shutdown** (`SIGTERM`/`SIGINT`): emit `app.stopping` → `shutdown(bootResult)`
(core: jobs → events → teardowns → DB close) → `ComponentLifecycleService.stop()`
→ `jobProcessor.shutdown()` (closes operational Bull queues+workers) →
`process.exit(0)`.

### 2. `bootModularSystem()` sub-sequence

```
for pkgName in config.modules (['@panel1/mod-audit','mod-support','mod-catalog',
                                '@panel1/mod-payments','@panel1/mod-billing']):
   moduleDefs.push((await import(pkgName)).default)

bootModules({
  modules: moduleDefs,
  db:    { connectionString: getDatabaseUrl() },
  redis: getRedisOptions(),
  requirePermission: apiRequirePermission,          // hono/security.ts
  eventBusOptions: { outbox: createEventOutboxHooks(db) },
  hostInfra: { email: SMTP-adapter, encryption: encryptionService, retry: moduleRetryManager },
  beforeJobSchedulerStart: installLegacyBridgeBeforeJobSchedulerStart,
})

seedModulePermissionsFromDefinitions(moduleDefs)
permissionManager.clearCache()

honoApp = new Hono()
honoApp.use('*', apiBearerAuthMiddleware)
honoApp.use('*', apiTenantMiddleware)
for (modName, routes) of result.moduleRoutes:
    honoApp.route(`/api/${modName}`, routes)

app.all('/api/*', expressToHonoAdapter(honoApp))    // Express → Hono bridge
```

Inside `@panel1/core.bootModules` (`packages/core/src/loader.ts`):

1. `validateDependencies` + `topologicalSort`.
2. Build `ServiceRegistry`, `EventBus` (Redis or in-mem), `FilterChain`,
   `JobScheduler` (queue `panel1-module-jobs`), `DbManager`.
3. `await eventBus.start()` — BullMQ worker comes up first.
4. For each module: `dbManager.collectSchema(mod.name, mod.schema)`.
5. Per module (topo order): build `ModuleContext` and call `mod.setup(ctx)`;
   record UI in `moduleUi`; emit `module.loaded`. Dependencies-skipped modules
   join `failedModules`.
6. **`beforeJobSchedulerStart({ eventBus, jobScheduler })` hook fires here.**
7. `await jobScheduler.start()` — now core crons + BullMQ repeatables spin up.

### 3. `initializeServices()` (legacy singletons)

Runs **after** modules + bridge are up:

1. `PluginManager.getInstance().initialize()` — loads in-repo plugin classes;
   emits `plugin.manager.*` / `plugin.lifecycle.*` (those the bridge listens
   for).
2. `componentProviderRegistry.initialize()`.
3. `ComponentLifecycleService.getInstance()` → `registerHandler('cpanel', new CpanelPlugin())`,
   `registerHandler('domain-manager', new DomainComponentHandler())`,
   `registerHandler('ssl-manager', new SslComponentHandler())`.
4. `lifecycleService.start()` — **spawns its own BullMQ `Worker` on queue
   `'events'`** (see risk §13).
5. `setPanel1CatalogRuntime({ providerRegistry, componentManagement, componentLifecycle })`
   — publishes the cross-cutting runtime that `modules/catalog`
   (`CatalogService.getRuntime()`) reads.

---

## 2. `apps/api/src/lib/core/legacyBridge.ts` — what `beforeJobSchedulerStart` wires

Order matters — this runs **after** every `mod.setup()` but **before** the core
`JobScheduler` worker starts.

1. `setApplicationEventBus(ctx.eventBus)` — publishes the global singleton used
   by the legacy `EventService` facade (`lib/core/appRuntime.ts`). Every legacy
   `eventService.emit(...)` call anywhere in `apps/api/src/lib/**` short-circuits
   to this bus; calling `EventService.emit` before bridge throws
   `"[appRuntime] Event bus not initialized…"`.
2. `await operationalQueues.initialize()` — Redis ping, then `createQueue()`
   for:
   - `subscription-renewal` (subscriptions)
   - `invoice-generation` (billing)
   - `payment-retry` (payments)
   - `dunning-management` (billing/subscriptions)
   - `provisioning-provision`, `-suspend`, `-unsuspend`, `-terminate`,
     `-modify`, `-sync`, `-health-check` (provisioning)
3. `await jobProcessor.initialize()` — registers BullMQ `Worker`s backing
   queues:
   - `subscription-renewal` → `SubscriptionRenewalProcessor` (concurrency 5)
   - `invoice-generation` → TODO stub (concurrency 3)
   - `payment-retry` → TODO stub (concurrency 3)
   - `dunning-management` → `DunningManager.{startDunningCampaign,executeDunningAttempt}`
     (concurrency 2)
   > Each worker writes start/complete/failed into `scheduled_jobs` rows.
4. `await PaymentEventHandler.getInstance().attachToEventBus(ctx.eventBus)`
   — subscribes `payment.succeeded` → invoice → subscription activation/renewal
   ledger updates; `payment.failed` → invoice FAILED. Emits
   `subscription.activated` / `subscription.renewed` / `subscription.unsuspended`
   back on the bus (via the legacy `eventService` facade → same core bus).
5. Plugin log listeners on core bus:
   - `plugin.manager.plugin:error`
   - `plugin.lifecycle.beforeInstall`
6. Four legacy crons registered on **core** `JobScheduler` with owner
   `'legacy'`:

   | Name | Cron | Handler |
   |------|------|---------|
   | `legacy-daily-subscription-renewals` | `0 1 * * *` | `operationalQueues.scheduleSubscriptionRenewals()` |
   | `legacy-hourly-failed-payments` | `0 * * * *` | `operationalQueues.processFailedPayments()` |
   | `legacy-dunning-campaigns` | `0 */6 * * *` | `operationalQueues.processDunningCampaigns()` |
   | `legacy-process-scheduled-jobs` | `*/30 * * * *` | `operationalQueues.processScheduledJobs()` |

---

## 3. `lib/jobs/OperationalQueues.ts` — queues ↔ domains

| Queue | Domain | Producer (cron) | Consumer |
|-------|--------|-----------------|----------|
| `subscription-renewal` | **subscriptions** | `scheduleSubscriptionRenewals` (daily) | `SubscriptionRenewalProcessor` via `subscriptionService.processRenewal` |
| `invoice-generation` | **billing** | `processScheduledJobs` (any `scheduled_jobs` row with this `queueName`) | stub (TODO → InvoiceService) |
| `payment-retry` | **payments** | `processFailedPayments` (hourly) | stub (TODO → PaymentService) |
| `dunning-management` | **billing / subscriptions** | `processDunningCampaigns` (6h) & direct `addJob` | `DunningManager.{startDunningCampaign,executeDunningAttempt}` |
| `provisioning-*` (7 queues) | **provisioning / domains / ssl** | `ComponentLifecycleService` / `ComponentManagementService` | `ComponentLifecycleService` (own `Worker` on queue `'events'`, see §13) |

State is also persisted to `scheduled_jobs` table (source of truth for
cron-less schedules — `processScheduledJobs` drains overdue rows into the
matching Bull queue).

---

## 4. `lib/jobs/JobProcessor.ts` — workers + queues

- Singleton `JobProcessor.getInstance()`. `initialize()` is called inside
  `legacyBridge`.
- After `operationalQueues.initialize()`, if any Bull queues exist, registers
  four workers (above table). Otherwise logs “fallback mode (cron-only)”.
- Each worker keeps a private BullMQ connection (re-reads `REDIS_HOST`/PORT/PASSWORD
  from env rather than reusing `getRedisOptions`).
- Statically imports `subscriptionService` and `dunningManager` — these
  symbols will migrate into `modules/subscriptions` / `modules/billing` and the
  workers must go with them.
- `shutdown()` closes workers + queues (called from `SIGTERM`/`SIGINT`).

---

## 5. `lib/core/appRuntime.ts` — `setApplicationEventBus` pattern

```ts
let applicationEventBus: EventBus | null = null;
export function setApplicationEventBus(bus: EventBus): void { applicationEventBus = bus; }
export function getApplicationEventBus(): EventBus {
  if (!applicationEventBus) throw new Error('[appRuntime] Event bus not initialized — boot must run installLegacyBridgeBeforeJobSchedulerStart');
  return applicationEventBus;
}
```

- **Single process-global**; set exactly once by `legacyBridge`.
- Everything in `apps/api/src/lib/**` that still emits goes through this:
  `EventService.emit` / `EventService.emitBatch`.
- Will become dead code once no legacy code path calls `eventService.emit`.

### Current `eventService.emit` call sites (20+) — must die with their domain

| File | Events | Owning module |
|------|--------|---------------|
| `lib/payments/PaymentService.ts` | `payment.succeeded`, `payment.failed` | payments |
| `lib/payments/gateways/StripeGateway.ts` | `payment.succeeded`, `payment.failed` | payments |
| `lib/payments/PaymentEventHandler.ts` | `subscription.activated`, `subscription.renewed`, `subscription.unsuspended` | payments |
| `lib/subscription/SubscriptionService.ts` | `subscription.activated/renewal_started/renewal_failed/terminated/past_due/suspended`, `payment.retry_needed` | subscriptions |
| `lib/invoice/ComponentInvoiceService.ts` | `invoice.created` | billing |
| `lib/components/ComponentManagementService.ts` | `component.restart.requested`, `component.configuration.update.requested`, `component.scale.requested` | provisioning |
| `lib/plugins/provisioning/CpanelPlugin.ts` | `account.created/suspended/unsuspended/terminated`, `server.overload` | provisioning |
| `lib/plugins/PluginManager.ts` | `plugin.lifecycle.*`, `plugin.manager.*` | host (will shrink) |

---

## 6. `lib/events/EventService.ts` — current forwarder

- `emit()` logs and forwards to `getApplicationEventBus().emit()`; no second
  BullMQ `events` queue anymore.
- `emitBatch()` just loops `emit()`.
- Used purely as a legacy compatibility shim. Deletes when all legacy call
  sites are migrated (i.e., when Phase 3 is complete).

---

## 7. `lib/catalog/catalogRuntime.ts` — cross-cutting pattern

```ts
interface Panel1CatalogRuntime {
  providerRegistry: ComponentProviderRegistry;
  componentManagement: ComponentManagementService;
  componentLifecycle: ComponentLifecycleService;
}
let runtime: Panel1CatalogRuntime | null = null;
setPanel1CatalogRuntime(r) / getPanel1CatalogRuntime()
```

- Used because `modules/catalog` needs to call into host-owned services
  (provider registry, component lifecycle) without bundling them.
- **Uncomfortable coupling**: `modules/catalog/src/CatalogService.ts` imports
  directly via relative path
  `../../../apps/api/src/lib/catalog/catalogRuntime.js` — breaks module
  portability and will block `tsc --build` once catalog ships in its own
  package build.

### Will other modules need similar runtimes?

- **Yes, temporarily**: `provisioning` will need access to
  `ComponentLifecycleService` + provisioning plugins (Cpanel, Domain, SSL)
  until those move too. Expect `setPanel1ProvisioningRuntime` (or
  consolidation into a single `Panel1HostRuntime`) mid-migration.
- **No**, long-term: once `modules/catalog` owns `ComponentProviderRegistry`
  and `modules/provisioning` owns `ComponentLifecycleService`, the runtime
  bridge disappears. Cross-module data flow should be service-registry or
  event-driven, not singleton handoffs.

---

## 8. `apps/api/src/hono/security.ts` — auth/tenant/RBAC wiring

- `resolveUserFromBearerToken(token)` uses legacy
  `getSessionByToken` (from `lib/auth`) → maps DB session to `Panel1AuthUser`.
- `skipCatalogPublicApi(c)` — public allowlist: `/api/catalog/public` and
  `/api/catalog/public/*`.
- Exports three Hono middlewares (all sourced from `@panel1/core/middleware`):
  - `apiBearerAuthMiddleware = createBearerAuthMiddleware({ resolveUser, shouldSkipAuth: skipCatalogPublicApi })`
  - `apiTenantMiddleware    = createTenantContextMiddleware({ requireTenant: true, shouldSkip: skipCatalogPublicApi })`
  - `apiRequirePermission   = createRequirePermissionMiddleware({ hasPermission })` — passed
    into `bootModules({ requirePermission })` so each module’s route uses it
    via `ctx.requirePermission`.
- `installLegacyBridgeBeforeJobSchedulerStart` is **not** referenced from
  `security.ts`; `index.ts` imports it separately from `lib/core/legacyBridge.js`
  and wires it into `bootModules`. (Parent’s note about `beforeJobSchedulerStart`
  usage in `security.ts` is inaccurate — it lives in `index.ts`.)

---

## 9. `apps/api/src/config.ts` — module order

```
modules = [
  '@panel1/mod-audit',
  '@panel1/mod-support',
  '@panel1/mod-catalog',
  '@panel1/mod-payments',
  '@panel1/mod-billing',
]
```

- `bootModules` will additionally topo-sort by declared `deps`.
- `getDatabaseUrl()` throws if env missing.
- `getRedisOptions()` returns host/port/password (password optional) — shared
  by core EventBus + JobScheduler **and** `OperationalQueues`/`JobProcessor`.

---

## 10. `apps/api/src/routers/index.ts` — remaining tRPC routers (≈15)

```
auth, users, clients, invoices, tenants, subscriptions, provisioning,
dashboard, domains(plugin), ssl(plugin), permissions, analytics,
paymentGateways, health, permissionGroups
```

- Catalog, components, plans already removed (3.1).
- Plugin-backed routers (`domains`, `ssl`) come from `PluginManager.getPlugins()`
  — a singleton the Hono world doesn’t need and eventually goes.

---

## 11. `packages/core` ModuleContext surface

From `packages/core/src/context.ts` (built by `createModuleContext`):

```
ctx.moduleName      string
ctx.db              host Drizzle db (unknown; module narrows)
ctx.service(name)   / ctx.service(name, impl)   ← ServiceRegistry
ctx.routes(app)     register a Hono sub-app for /api/<module>/*
ctx.on(event, h)    subscribe on core EventBus
ctx.filter(ev,h,p)  priority-ordered filter chain
ctx.emit(ev,p)      publish on core EventBus
ctx.job(name, cron, handler, opts?)   register on core JobScheduler
ctx.config          validated module config
ctx.logger          child logger (operation=moduleName)
ctx.requirePermission(...ids)   host-injected (OR-semantics RBAC middleware)
ctx.email            ? host EmailTransport (hostInfra.email)
ctx.encryption       ? host EncryptionPort
ctx.retry            ? host RetryPort
```

`tenantId` is **not** on `ctx` — it comes in via Hono request context
(`c.get('user').tenantId`) after `apiTenantMiddleware` runs.

---

## 12. Domain → legacyBridge removal map

Each domain migration should delete the relevant operational Bull queue,
legacy cron, and event handler; replace with
`modules/{name}/src/setup(ctx)` calls to `ctx.job`, `ctx.on`, and `ctx.emit`.
Drop the corresponding `apps/api/src/lib/*` source.

| When this module lands | Remove from `legacyBridge.ts` / `OperationalQueues` / `JobProcessor` / `index.ts` | Remove from `apps/api/src/lib/` | Add to `modules/<m>/setup(ctx)` |
|---|---|---|---|
| **3.2 billing** (`@panel1/mod-billing`) | `invoice-generation` queue + worker stub; `dunning-management` queue+worker + `DunningManager` share; `legacy-dunning-campaigns` cron; `legacy-process-scheduled-jobs` cron (invoice paths); eventually `ComponentInvoiceService` emits | `lib/invoice/**` (InvoiceNumber, InvoicePDF, TaxCalculation, ComponentInvoice), `lib/dunning/**`, `routers/invoices.ts`, invoice/dunning schema | `ctx.job('invoices.generate', …)`, `ctx.job('invoices.dunning', …)`, `ctx.on('payment.succeeded', markInvoicePaid)`, `ctx.emit('invoice.created', …)` |
| **3.3 payments** (already scaffolded) | `PaymentEventHandler.attachToEventBus` (payment.succeeded/failed); `payment-retry` queue + worker stub; `legacy-hourly-failed-payments` cron; Stripe/PaymentService `eventService.emit('payment.*')` | `lib/payments/**` (PaymentService, PaymentEventHandler, StripeGateway, PaymentGatewayService, core/interfaces), `routers/payment-gateways.ts` | `ctx.on('invoice.created', …)`, `ctx.emit('payment.succeeded\|failed', …)`, `ctx.job('payments.retry', …)` |
| **3.4 subscriptions** | `subscription-renewal` queue + `SubscriptionRenewalProcessor`; `legacy-daily-subscription-renewals` cron; `SubscriptionService` event emissions | `lib/subscription/**` (SubscriptionService, DunningManager shares), `lib/jobs/processors/SubscriptionRenewalProcessor.ts`, `routers/subscriptions.ts` | `ctx.job('subscriptions.renewal', …)`, `ctx.on('payment.succeeded', activate)`, `ctx.on('payment.failed', pastDue)`, `ctx.emit('subscription.*')` |
| **3.5 provisioning** | `provisioning-*` queues; plugin log handlers on bus (`plugin.manager.plugin:error`, `plugin.lifecycle.beforeInstall`); `lifecycleService.start()` + `registerHandler('cpanel'/'domain-manager'/'ssl-manager')` in `initializeServices()`; `componentProviderRegistry.initialize()`; `setPanel1CatalogRuntime({…})` (collapses) | `lib/provisioning/**`, `lib/components/**`, `lib/plugins/provisioning/**`, provisioning plugin glue in `routers/index.ts`, `routers/provisioning.ts` | `ctx.on('subscription.activated', provision)`, `ctx.job('provisioning.health', …)`, `ctx.emit('account.*', …)`; `modules/provisioning` exposes a runtime service (or direct registry) so catalog can resolve providers |
| **3.6 schema ownership** | N/A (cleanup) | move per-module tables out of `db/schema/`, keep core tables (`users`, `tenants`, `sessions`, `scheduled_jobs`, `event_outbox`, `roles`, `permissions`, `clients`) | modules declare `schema:` in `defineModule()`; `DbManager.collectSchema` already supports this |
| **4.1 domains** | `DomainComponentHandler` registration in `initializeServices()`; `domainPlugin` branch in `routers/index.ts` | `lib/domains/**`, `lib/plugins/domain/**` | domains module provides Hono routes + `IRegistrar` registered via service registry |
| **4.2 ssl** | `SslComponentHandler` registration; `sslPlugin` branch in `routers/index.ts` | `lib/ssl/**`, `lib/plugins/ssl/**` | ssl module provides Hono routes + lifecycle |
| **4.x plugins** | `PluginManager.getInstance().initialize()` in `initializeServices()` when the last plugin migrates | `lib/plugins/PluginManager.ts`, `lib/plugins/*` | n/a (replaced by module system) |
| **5.3 tRPC retirement** | `/trpc` middleware in `index.ts`, `routers/index.ts`, `trpc/`, remaining auth/users/clients/tenants/dashboard routers | same | same endpoints as Hono routes inside relevant modules |
| **5.4 Express retirement** | `app.all('/api/*', expressToHonoAdapter)` bridge, helmet/cors (move to Hono equivalents), `/health` | Express dep | Hono-native bootstrap |

Once subscriptions, payments, billing all migrate, `legacyBridge.ts` holds
**only** plugin log listeners — at which point the whole file plus
`appRuntime.ts`, `EventService.ts`, and `OperationalQueues`/`JobProcessor`
can be deleted in a single commit and `beforeJobSchedulerStart` can be
removed from `index.ts`.

---

## 13. Singletons & unsafe coupling — migration risks

| Risk | Where | Why it bites |
|------|-------|-------------|
| `setApplicationEventBus` global | `lib/core/appRuntime.ts` | Any non-bridge import path (tests, scripts, CLI seeders) that calls `eventService.emit` before `bootModules` runs throws. Keep until zero legacy emit call sites remain. |
| `ComponentLifecycleService` own `Worker` on queue `'events'` | `lib/components/ComponentLifecycleService.ts:30` | Second BullMQ worker parallel to the core EventBus (also BullMQ). Not wired into `bootResult.eventBus` — consumes a separate `'events'` queue, so any host `eventBus.emit('component.*')` doesn’t flow here. Must migrate with provisioning or the `'events'` queue silently orphans. |
| `PluginManager.getInstance()` | used by `initializeServices` **and** `routers/index.ts` at module import time | `plugins.get('domain-plugin')`/`'ssl-plugin'` is resolved **before `initialize()`** (import-time), so routers always get whatever `PluginManager` returns from its in-constructor state. Migrating domains/ssl requires removing both call sites together. |
| `operationalQueues` + `jobProcessor` singletons | `lib/jobs/*` | Initialized inside legacyBridge but `jobProcessor.shutdown()` is called in SIGTERM/SIGINT handlers even when the bridge didn’t run (e.g. early crash). Safe today (no-op if uninitialized), but each domain’s removal must delete its queue *and* its `registerXProcessor()` call site. |
| `PaymentEventHandler` singleton | `lib/payments/PaymentEventHandler.ts` | Attaches to the **current** `ctx.eventBus`. If bridge runs twice (tests), subscriptions duplicate. |
| `subscriptionService`, `dunningManager` static imports inside workers | `lib/jobs/JobProcessor.ts` | Worker holds hard references; moving either into a module without preserving the symbol breaks renewals instantly. Mission: when subscriptions migrates, the whole worker class must move with it. |
| `setPanel1CatalogRuntime` cross-package import | `modules/catalog/src/CatalogService.ts` → `apps/api/src/lib/catalog/catalogRuntime.js` | Module reaches into host by relative path. Breaks `npm pack`, TypeScript project refs, and any attempt to version `@panel1/mod-catalog` independently. Must be broken in 3.5/3.6. |
| `scheduled_jobs` polling (`processScheduledJobs`) | `OperationalQueues.ts` | Polls a legacy table and pushes to Bull. Once all producers stop writing `scheduled_jobs`, drop the cron and table. |
| Dual HTTP stacks (Express + Hono) | `index.ts` | `/trpc` on Express, `/api/*` via Hono fetch bridge. Worth noting: every Hono request spins a new `Request`, streams req body through `for await`, then serializes `res.text()` — not great for streaming endpoints (audit downloads mitigated by separate Express route paths). 5.4 retires this. |
| `JobProcessor` re-reads Redis env directly | `JobProcessor.ts` workers | `getRedisOptions` isn’t shared. If someone adds TLS/URL in config later, workers miss it. |
| `seedModulePermissionsFromDefinitions` runs post-boot | `index.ts` | A module whose `setup` checks permissions at import time sees the old cache until `clearCache()`. Already handled but fragile — keep ordering (`setup` → `seed` → `clearCache`). |
| SIGTERM/SIGINT race | `index.ts` | If signal fires while `app.listen` callback is still executing (boot in progress), `bootResult` is `null` and `shutdown()` is skipped — DB + Redis connections can leak. Migration of long setup paths should be mindful. |

---

## Appendix A — Schema barrel still shared (3.6 scope)

`apps/api/src/db/schema/**` is currently imported by **every** legacy
`lib/*` service and the operational queues. Each module migration must ship
with its own `schema.ts` + remove the barrel re-export of those tables. The
boot loop already calls `dbManager.collectSchema(moduleName, mod.schema)` so
once a module declares `schema:`, its queries in `apps/api/src/lib/**` must
be deleted in the same commit (or FK-level mismatch will surface at runtime).

## Appendix B — File inventory touched by the bridge

```
apps/api/src/
├── index.ts
├── config.ts
├── hono/security.ts
├── routers/index.ts
├── lib/
│   ├── auth/ (PermissionManager, types)
│   ├── auth.ts (getSessionByToken)
│   ├── core/
│   │   ├── appRuntime.ts           ← kill when §12 finishes
│   │   ├── legacyBridge.ts         ← kill when §12 finishes
│   │   └── eventOutbox.ts
│   ├── events/EventService.ts      ← kill when §12 finishes
│   ├── jobs/
│   │   ├── JobProcessor.ts         ← kill with subscriptions+billing+payments
│   │   ├── OperationalQueues.ts    ← kill with subscriptions+billing+payments+provisioning
│   │   └── processors/
│   │       └── SubscriptionRenewalProcessor.ts  ← kill with subscriptions
│   ├── payments/
│   │   ├── PaymentEventHandler.ts  ← kill with payments
│   │   ├── PaymentService.ts       ← kill with payments
│   │   ├── PaymentGatewayService.ts
│   │   ├── gateways/StripeGateway.ts
│   │   ├── interfaces/, core/
│   │   └── index.ts
│   ├── subscription/
│   │   ├── SubscriptionService.ts  ← kill with subscriptions
│   │   └── DunningManager.ts       ← split between subscriptions & billing
│   ├── invoice/                    ← billing
│   ├── catalog/
│   │   ├── ComponentProviderRegistry.ts   ← moves under catalog/provisioning
│   │   └── catalogRuntime.ts              ← delete after 3.5
│   ├── components/
│   │   ├── ComponentManagementService.ts  ← provisioning
│   │   └── ComponentLifecycleService.ts   ← provisioning
│   ├── domains/                    ← 4.1
│   ├── ssl/                        ← 4.2
│   ├── provisioning/               ← 3.5
│   ├── plugins/
│   │   ├── PluginManager.ts
│   │   ├── domain/, ssl/, provisioning/
│   │   └── index.ts stub
│   ├── permissions/seedModulePermissions.ts
│   ├── email/, security/, logging/, resilience/, errors/, health/, middleware/
│   └── (1.5 deferred cleanup: re-exports that point to @panel1/core)
```
