# Catalog Module Template (Gold‑Standard Phase‑3 Migration)

Source of truth: `/root/projects/panel1/modules/catalog/` as it exists after Issue 3.1
(commit lineage shows `1a9df94`, `e4bfdd5`, `3631759` and earlier catalog work).
Every other domain slated for migration (billing, payments, subscriptions,
provisioning, domains, ssl) should follow the exact file layout, wiring, and
conventions recorded here.

---

## 1. File Layout

`modules/catalog/` (workspace root):

| Path                               | LOC   | Purpose                                                   | Public? |
|------------------------------------|-------|-----------------------------------------------------------|---------|
| `package.json`                     | 22    | Workspace manifest: `@panel1/mod-catalog`                 | exports |
| `tsconfig.json`                    | 12    | Extends root; path aliases to `@panel1/core` + `types`    | internal |
| `src/index.ts`                     | 42    | `defineModule({...})` default export + `ICatalogService`  | public default export |
| `src/schema.ts`                    | 180   | Drizzle tables + relations + `catalogSchema` barrel       | public (for DbManager) |
| `src/CatalogService.ts`            | 1 037 | Business logic; DB access; runtime bridge calls           | instance registered via `ctx.service('catalog', …)` |
| `src/routes.ts`                    | 625   | `catalogRoutes(ctx)` Hono `Hono` router factory           | returned to `ctx.routes()` |
| `src/types.ts`                     | 13    | `ICatalogService`, `IComponentDependency`                 | public via `./types` export |
| `src/seed-permissions.ts`          | 12    | `SEED_PERM` canonical RBAC id constants                   | internal to module |

No tests live inside the module — they are colocated elsewhere (`apps/api/src/__tests__`,
`apps/api/src/lib/catalog/__tests__`). The module's `package.json build` script is
a no‑op because CatalogService imports host runtime; typecheck is delegated to
`apps/api` + `tsx`.

```jsonc
// modules/catalog/package.json (key fields)
"name": "@panel1/mod-catalog",
"type": "module",
"main": "./src/index.ts",
"types": "./src/index.ts",
"exports": { ".": "./src/index.ts", "./types": "./src/types.ts" },
"dependencies": {
  "@panel1/types": "*",
  "@panel1/core": "*",
  "drizzle-orm": "^0.29.3",
  "hono": "^4.7.5",
  "zod": "^3.22.4"
}
```

`tsconfig.json` extends the repo root and pins path aliases locally:

```jsonc
"paths": {
  "@panel1/types":   ["../../packages/types/src"],
  "@panel1/types/*": ["../../packages/types/src/*"],
  "@panel1/core":    ["../../packages/core/src"],
  "@panel1/core/*":  ["../../packages/core/src/*"]
}
```

---

## 2. `src/index.ts` — `defineModule()` shape

```ts
import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { catalogSchema }  from './schema.js';
import { CatalogService } from './CatalogService.js';
import { catalogRoutes }  from './routes.js';

export default defineModule({
  name: 'catalog',
  version: '0.1.0',
  deps: [],

  schema: catalogSchema,         // object literal of Drizzle tables + relations
  config: z.object({}),          // zod schema for module config (parsed with {})
  permissions: [                 // string ids that seedModulePermissions auto-upserts
    'catalog.plans.view', 'catalog.plans.create', 'catalog.plans.edit',
    'catalog.plans.delete', 'catalog.dashboard.view',
    'catalog.products.manage', 'catalog.products.create',
    'catalog.products.edit', 'catalog.components.manage',
  ],
  emits: [                       // event names this module publishes
    'catalog.component.definition_created',
    'catalog.component.definition_updated',
    'catalog.component.definition_deleted',
    'catalog.product.deleted',
  ],

  setup(ctx) {
    const catalogService = new CatalogService(ctx);
    ctx.service('catalog', catalogService);    // register singleton for others
    ctx.routes(catalogRoutes(ctx));            // mount Hono sub-app
  },
});

export type { ICatalogService } from './types.js';
```

Patterns to copy verbatim:

* Always the five import lines (core, zod, schema, Service, routes).
* `name` must match the package folder and match `apps/api/src/config.ts` list entry
  (minus the `@panel1/mod-` prefix).
* `deps: []` — fill in only if the module genuinely calls `ctx.service<T>('otherMod')`
  during `setup()`. The core loader topologically sorts and skips modules whose
  deps failed.
* `schema` is a plain barrel object of tables + relations (NOT re-exported as
  `export *`). DbManager reads it via `collectSchema(name, schema)` and merges all
  tables into one Drizzle instance (`ctx.db`).
* `config: z.object({...})` with defaults — parsed once with `{}` during boot.
* `permissions` / `emits` are documentation + contract. `permissions` drive
  `seedModulePermissionsFromDefinitions()` which upserts RBAC rows.
* `setup()` is synchronous in catalog; it may be async.
* Re‑export the service interface from `index.ts` so consumers can
  `import type { ICatalogService } from '@panel1/mod-catalog'`.

---

## 3. `src/schema.ts` — Drizzle tables

Characteristics of the catalog schema:

* Plain `pgTable(...)` declarations — **no FKs to other modules' tables**. FK-like
  columns (e.g. `billingPlans.productId`, `subscribedComponents.subscriptionId`,
  `*.tenantId`) are declared as bare `uuid()` without `.references()`. This is
  intentional: each module owns its schema slice and talks to peers via
  `ctx.service<T>('otherModule').…` at runtime.
* Relations (`relations(products, ({ many }) => …)`) are kept **within the same
  module** — only between tables the module owns (`products ↔ productComponents ↔
  components`, `products ↔ billingPlans`).
* Tables exposed: `componentProviders`, `components`, `products`,
  `productComponents`, `billingPlans`, `subscribedComponents`, `plans` (legacy).
* One enum: `billingIntervalLegacyEnum` (`'billing_interval'`). Note the Postgres
  enum name collides with the one declared in `apps/api/src/db/schema/catalog.ts`
  (also `billing_interval`). This works in practice because Drizzle pushes
  the first definition; both sides agree. Future modules must be careful not to
  double‑declare enums.
* **Naming prefix**: table names are NOT prefixed (`components`, `products`,
  `plans`). The module's name does NOT appear in DB identifiers. This matches
  the pre‑migration physical layout so data survives the cut‑over.
* The module exports `catalogSchema` object literal at the bottom:

```ts
export const catalogSchema = {
  componentProviders,
  components, componentsRelations,
  products, productsRelations,
  productComponents, productComponentsRelations,
  billingPlans, billingPlansRelations,
  subscribedComponents,
  plans,
};
```

This is consumed by `DbManager.collectSchema('catalog', catalogSchema)` and merged
into one `drizzle(client, { schema: { ...catalog, ...audit, ...support, ... } })`
instance shared across all modules via `ctx.db`.

---

## 4. `src/CatalogService.ts`

### Constructor / state

```ts
export class CatalogService {
  constructor(readonly ctx: ModuleContext) {}
  private get db(): Db { return this.ctx.db as Db; }
  private runtime() { return getPanel1CatalogRuntime(); }
}
```

* Receives `ModuleContext` and keeps it. Everything the service needs (`db`,
  `logger`, `emit`, other services) flows from `ctx`.
* `this.ctx.db` is cast to a loose `any`-like `Db` alias because strict typing
  against the DbManager merged schema pulls the host's whole type graph.

### Private vs public methods

* `private validateConfiguration`, `private compareVersions`,
  `private validateDependenciesSync` — internal helpers.
* Everything else on the class is public and called from `routes.ts` and from
  other modules via `ctx.service<ICatalogService>('catalog')`.

### Usage of `ctx.*`

| `ctx` member       | Used in catalog? | Notes |
|--------------------|------------------|-------|
| `ctx.db`           | Everywhere       | Drizzle query builder + `tx.transaction(...)` |
| `ctx.logger`       | Not used yet     | Reserved — audit module uses it heavily |
| `ctx.emit`         | Yes              | `catalog.component.definition_created/updated/deleted`, `catalog.product.deleted` |
| `ctx.service<T>`   | Not used yet     | Catalog has no peer calls; future modules will use it for cross-module lookup |
| `ctx.requirePermission` | Via routes only | Passed into host at boot; `routes.ts` routes wrap `ctx.requirePermission(...)` |
| `ctx.email / encryption / retry` | Not used | Available from host via `bootModules({ hostInfra })` |

### The `runtime()` shim

`CatalogService` imports a **host‑app runtime bridge**:

```ts
import { getPanel1CatalogRuntime }
  from '../../../apps/api/src/lib/catalog/catalogRuntime.js';
```

This reaches out of the module into `apps/api` to fetch three singletons that
cannot easily be inverted as `ctx.service`:

```ts
// apps/api/src/lib/catalog/catalogRuntime.ts
export interface Panel1CatalogRuntime {
  providerRegistry: ComponentProviderRegistry;
  componentManagement: ComponentManagementService;
  componentLifecycle: ComponentLifecycleService;
}
let runtime: Panel1CatalogRuntime | null = null;
export function setPanel1CatalogRuntime(r) { runtime = r; }
export function getPanel1CatalogRuntime() { if (!runtime) throw …; return runtime; }
```

Rationale (per Issue 3.1): the legacy lifecycle/registry services manage real
running component instances and plugin handlers and need initialization before
any route can resolve them. The module therefore consumes them through a tiny,
typed service-locator in the host. Future migrations that depend on similarly
long-lived host singletons (e.g. `payments/PaymentGatewayManager`,
`provisioning/CpanelAdapter`) should mirror this pattern: a `fooRuntime.ts`
in `apps/api/src/lib/{foo}/` plus `setPanel1FooRuntime()` called from
`initializeServices()` in `apps/api/src/index.ts`.

### Size / shape

`CatalogService` is 1 037 LOC and covers 7 logical areas:

1. Provider metadata/health (`getProvidersMetadata`, `performHealthCheck`)
2. Component definitions CRUD (`createComponentDefinition`, …)
3. Dynamic component registration (`registerComponent`, `updateRegisteredComponent`,
   `validateComponentKey`, `getComponentRegistrationStats`)
4. Products CRUD + storefront (`createProduct`, `updateProduct`, `deleteProduct`,
   `getProduct`, `listProducts`, `searchProducts`, `listPublicProducts`)
5. BillingPlans CRUD (`createBillingPlan`, `updateBillingPlan`, …)
6. Product↔component linkage (`productComponentsAdd/Update/Remove`)
7. Subscribed component ops + legacy plans (`reportUsage`, `plansGetAll`/`Create`/…,
   `checkComponentHealth`, `restartSubscribedComponent`,
   `updateSubscribedConfiguration`, `scaleSubscribedComponent`,
   `getSubscribedComponentStatus`)

There's also a free helper `requireAdmin(user)` exported from the same file for
routes that need a quick ADMIN/SUPER_ADMIN gate separate from RBAC.

---

## 5. `src/routes.ts` — Hono (not OpenAPIHono)

Catalog uses plain `new Hono()`, **not** `@hono/zod-openapi`. OpenAPI generation
is deferred to Phase 5.3. Shape:

```ts
export function catalogRoutes(ctx: ModuleContext): Hono {
  const app = new Hono();
  const svc = () => new CatalogService(ctx);
  …
  return app;
}
```

### Middleware application

* Cross‑cutting middleware is applied **once at the host** in
  `apps/api/src/index.ts`, not per‑module:

  ```ts
  honoApp.use('*', apiBearerAuthMiddleware);   // sets c.get('user')
  honoApp.use('*', apiTenantMiddleware);       // sets c.get('tenantId')
  for (const [moduleName, routes] of result.moduleRoutes) {
    honoApp.route(`/api/${moduleName}`, routes as any);
  }
  ```

* Public routes (`/api/catalog/public/*`) are exempted from Bearer + tenant via
  the `shouldSkipAuth` / `shouldSkip` predicates in `apiBearerAuthMiddleware` /
  `apiTenantMiddleware` (see §11 below).
* Per‑route RBAC uses a helper inside the module:

  ```ts
  function routePerm(ctx: ModuleContext, ...ids: string[]): MiddlewareHandler[] {
    const rp = ctx.requirePermission;
    if (!rp) throw new Error('host must pass requirePermission via bootModules()');
    return [rp(...ids) as MiddlewareHandler];
  }
  app.post('/components/definitions',
    ...routePerm(ctx, SEED_PERM.componentsManage),
    async (c) => { … });
  ```

  `routePerm` hard-fails if the host did not wire `requirePermission` — this makes
  the coupling visible at boot of the first request.

### Request validation

All bodies and query strings validated with `zod`. Typical shape:

```ts
const createDef = z.object({ … });
app.post('/components/definitions', ...routePerm(ctx, SEED_PERM.componentsManage),
  async (c) => {
    try {
      const body = createDef.parse(await c.req.json());
      const user = c.get('user') as Panel1AuthUser;
      const row  = await svc().createComponentDefinition({ ...body, tenantId: user.tenantId ?? null });
      return c.json(row, 201);
    } catch (e) { return jsonError(c, e); }
  });
```

### Error handling

Single helper:

```ts
function jsonError(c, e, status = 400) {
  const message = e instanceof Error ? e.message : 'Request failed';
  return c.json({ error: message }, status);
}
```

404 is explicit (`getProduct`, `getLegacyPlan`, `getBillingPlan`). Admin‑only
legacy routes check via `requireAdmin(c.get('user'))` and map to 403.

### Response shapes

Plain JSON objects/arrays — whatever Drizzle returns, occasionally wrapped into
`{ success: true, … }`. No response zod schemas, no OpenAPI responses object.

### Tenant read

```ts
const tenantId = (c) => String(c.get('tenantId') || '');
```

set by `apiTenantMiddleware` from the authenticated user. Public routes bypass
this entirely.

### Route inventory (for reference)

Public:
* `GET /public/products` (storefront)

Providers:
* `GET /providers`, `GET /providers/health`

Component definitions:
* `POST /components/definitions` (perm `catalog.components.manage`)
* `PATCH /components/definitions/:id` (same perm)
* `DELETE /components/definitions/:id` (same perm)
* `GET /components/definitions/:id`
* `GET /components`

Dynamic registration:
* `POST /components/register` (perm)
* `PATCH /components/register/:id` (perm)
* `GET /components/validate-key` (perm)
* `GET /components/stats` (perm)

Products:
* `POST /products` (`catalog.products.create`)
* `PATCH /products/:id` (`catalog.products.edit`)
* `DELETE /products/:id` (`catalog.products.manage`)
* `GET /products/:id`, `GET /products`, `GET /products-search`

Billing plans:
* `POST /billing-plans`, `PATCH /billing-plans/:id`,
  `DELETE /billing-plans/:id` (`catalog.products.manage`)
* `GET /billing-plans/:id`, `GET /billing-plans`

Product↔component links:
* `POST /product-components`, `PATCH /product-components/:id`,
  `DELETE /product-components/:id` (`catalog.products.manage`)

Usage:
* `POST /usage/report`

Legacy `plans` table:
* `GET /legacy-plans` (`catalog.plans.view`)
* `GET /legacy-plans/:id` (`catalog.plans.view`)
* `POST /legacy-plans` (`catalog.plans.create`)
* `PATCH /legacy-plans/:id` (`catalog.plans.edit`)
* `DELETE /legacy-plans/:id` (`catalog.plans.delete`)

Subscribed instance ops (ex `components` tRPC router):
* `GET /instances/health` (admin only)
* `POST /instances/:id/restart`
* `PATCH /instances/:id/configuration`
* `POST /instances/:id/scale`
* `GET /instances/:id/status`

---

## 6. `src/types.ts`

Minimal:

```ts
import type { ModuleContext } from '@panel1/types';

export interface ICatalogService {
  readonly ctx: ModuleContext;
}

export interface IComponentDependency {
  componentKey: string;
  minVersion?: string;
  maxVersion?: string;
  required: boolean;
  description?: string;
}
```

No DTO re‑exports, no `EventMap` merge, no augmentation of
`@panel1/types`' `EventMap` interface — catalog events are untyped strings for
now. The generic `ctx.emit<K extends keyof EventMap>(…)` already allows arbitrary
strings via the overload, so this works. Issue 3.4+ may introduce a typed
`EventMap` merge.

Re‑exported from the module root:

```ts
// src/index.ts (last line)
export type { ICatalogService } from './types.js';
```

---

## 7. `src/seed-permissions.ts`

```ts
/** Canonical RBAC ids — aligned with `apps/api` `seed-rbac-data.ts`. */
export const SEED_PERM = {
  plansView:       'catalog.plans.view',
  plansCreate:     'catalog.plans.create',
  plansEdit:       'catalog.plans.edit',
  plansDelete:     'catalog.plans.delete',
  dashboardView:   'catalog.dashboard.view',
  productsManage:  'catalog.products.manage',
  productsCreate:  'catalog.products.create',
  productsEdit:    'catalog.products.edit',
  componentsManage:'catalog.components.manage',
} as const;
```

**Caller**: `routes.ts` only. The names must match exactly the strings in
`apps/api/src/scripts/seed-rbac-data.ts` (role→permission assignments) AND the
`permissions: [...]` array in `index.ts`. Boot-time
`seedModulePermissionsFromDefinitions()` (apps/api/src/lib/permissions/
seedModulePermissions.ts) upserts the string ids from `defineModule` into
`db/schema/roles.ts → permissions`, mapping the first dotted segment to a
coarse `ResourceType` (`catalog → PRODUCT`, `support → SUPPORT_TICKET`, …).

Module author checklist:
1. Add ids to `seed-permissions.ts`.
2. Add the same strings to `defineModule({ permissions })`.
3. Add them to `apps/api/src/scripts/seed-rbac-data.ts` role bindings.
4. Reference only via `SEED_PERM.*` in routes.

---

## 8. `package.json` / `tsconfig.json`

* Package name: `@panel1/mod-catalog` (prefix `@panel1/mod-` for every module).
* `private: true`, `type: module`.
* `main` + `types` both point to `./src/index.ts`; `exports` map exposes `.` and
  `./types`.
* `scripts.build` is an `echo` no‑op; `scripts.lint` runs `eslint src --ext .ts`.
* Runtime deps: `@panel1/types`, `@panel1/core`, `drizzle-orm`, `hono`, `zod`.
  Nothing more. No direct `postgres`, no host deps — everything flows through
  `ctx`.
* `tsconfig.json` extends the repo root, adds `rootDir: ./src`, and pins path
  aliases to the in‑repo `packages/{types,core}/src` so `tsx` picks them up.

---

## 9. Host wiring

### 9.1 `apps/api/src/config.ts` — module list order

```ts
export const modules = [
  '@panel1/mod-audit',
  '@panel1/mod-support',
  '@panel1/mod-catalog',
  '@panel1/mod-payments',
  '@panel1/mod-billing',
];
```

Order is ultimately driven by `deps[]` (topological sort in
`packages/core/src/loader.ts`). Listing above is only the import order. The
current phase 3 plan (roadmap) migrates further modules in this order:
catalog → billing → payments → subscriptions → provisioning → domains → ssl.

### 9.2 `apps/api/src/index.ts` — boot sequence

Simplified:

```ts
app.listen(PORT, async () => {
  await initializeEmailService();
  bootResult = await bootModularSystem();   // (1) bootModules
  await initializeServices();               // (2) legacy + setPanel1CatalogRuntime
});

async function bootModularSystem() {
  const moduleDefs = await Promise.all(moduleList.map(p => import(p).then(m => m.default)));

  const result = await bootModules({
    modules: moduleDefs,
    db: { connectionString: getDatabaseUrl() },
    redis: getRedisOptions(),
    requirePermission: apiRequirePermission,
    eventBusOptions: { outbox: createEventOutboxHooks(db) },
    hostInfra: { email: {…}, encryption: encryptionService, retry: moduleRetryManager },
    beforeJobSchedulerStart: installLegacyBridgeBeforeJobSchedulerStart,
  });

  await seedModulePermissionsFromDefinitions(moduleDefs);
  permissionManager.clearCache();

  const honoApp = new Hono();
  honoApp.use('*', apiBearerAuthMiddleware);
  honoApp.use('*', apiTenantMiddleware);
  for (const [name, routes] of result.moduleRoutes)
    honoApp.route(`/api/${name}`, routes as any);

  app.all('/api/*', /* express-to-hono bridge */);
  return result;
}
```

Key points:

1. `bootModules({ modules, db, redis, requirePermission, hostInfra,
   beforeJobSchedulerStart, eventBusOptions })` is the single entry point.
2. `requirePermission: apiRequirePermission` flows into every `ctx` so
   `routes.ts` can call `ctx.requirePermission(...)`.
3. `hostInfra` provides `email`, `encryption`, `retry` to modules without
   forcing them to import host code.
4. `eventBusOptions.outbox = createEventOutboxHooks(db)` — DB‑backed outbox in
   `event_outbox` table (issue 1.1).
5. `beforeJobSchedulerStart = installLegacyBridgeBeforeJobSchedulerStart` —
   wires old `OperationalQueues`, `JobProcessor`, `PaymentEventHandler` onto the
   same core EventBus/JobScheduler.
6. `seedModulePermissionsFromDefinitions(moduleDefs)` runs after boot to upsert
   any new permission names.
7. Module routers are mounted at `/api/<moduleName>/*`.
8. Express still owns port 3001 + `/trpc` for the unmigrated routers; a small
   `app.all('/api/*', …)` adapter forwards to `honoApp.fetch(...)` (deleted in
   Phase 5.4).
9. `initializeServices()` (called after boot) creates `ComponentProviderRegistry`,
   `ComponentLifecycleService`, component handlers (`CpanelPlugin`, `DomainComponentHandler`,
   `SslComponentHandler`), starts lifecycle, then calls:

   ```ts
   setPanel1CatalogRuntime({
     providerRegistry: componentProviderRegistry,
     componentManagement: ComponentManagementService.getInstance(),
     componentLifecycle: lifecycleService,
   });
   ```

### 9.3 `apps/api/src/lib/catalog/catalogRuntime.ts`

```ts
export interface Panel1CatalogRuntime {
  providerRegistry: ComponentProviderRegistry;
  componentManagement: ComponentManagementService;
  componentLifecycle: ComponentLifecycleService;
}
let runtime: Panel1CatalogRuntime | null = null;
export function setPanel1CatalogRuntime(r): void { runtime = r; }
export function getPanel1CatalogRuntime(): Panel1CatalogRuntime {
  if (!runtime) throw new Error('Panel1 catalog runtime not initialized');
  return runtime;
}
```

Lives *outside* the module on purpose. Cross‑cuts two concerns the module can't
own yet:

1. A long‑lived plugin registry (`ComponentProviderRegistry`) whose providers
   must register before routes run.
2. A lifecycle service that owns handler startup/shutdown (`CpanelPlugin`,
   `DomainComponentHandler`, `SslComponentHandler`) which reach into other
   domains (provisioning, domains, ssl).

When those domains land as modules (phase 4), the runtime bridge should shrink
or collapse into `ctx.service('provisioning')` etc.

---

## 10. Per‑module Drizzle migrations — where?

**Currently centralized**, not per‑module.

* `apps/api/drizzle.config.ts`:
  ```ts
  { schema: './src/db/schema/*', out: './src/db/migrations' }
  ```
* Migrations live in `apps/api/src/db/migrations/` (files `0000_…` through
  `0004_event_outbox.sql`).
* `npm run db:generate` → `drizzle-kit generate:pg`, `npm run db:migrate` →
  `drizzle-kit push:pg` (both in `apps/api/package.json`).
* `packages/core/src/db.ts` `DbManager.collectSchema()` only builds an in-memory
  Drizzle client from the *merged* module schemas; it does NOT generate DDL.

Practical consequence for other modules: tables declared in
`modules/<name>/src/schema.ts` will not be migrated automatically. Either
(a) keep a mirror in `apps/api/src/db/schema/<name>.ts` during the transition
(what catalog does — see §13), or (b) point `drizzle.config.ts` at
`../../modules/*/src/schema.ts` and move ownership. Phase 3.6 will do (b).

---

## 11. Public route allowlist in `apps/api/src/hono/security.ts`

```ts
/** Storefront catalog listing (replaces tRPC `catalog.listPublic`). */
function skipCatalogPublicApi(c: { req: { path: string } }): boolean {
  const p = c.req.path;
  return p === '/api/catalog/public' || p.startsWith('/api/catalog/public/');
}

export const apiBearerAuthMiddleware = createBearerAuthMiddleware({
  resolveUser: resolveUserFromBearerToken,
  shouldSkipAuth: skipCatalogPublicApi,
});

export const apiTenantMiddleware = createTenantContextMiddleware({
  requireTenant: true,
  shouldSkip: skipCatalogPublicApi as Parameters<
    typeof createTenantContextMiddleware
  >[0]['shouldSkip'],
});
```

Pattern to mimic for future modules with storefront endpoints (e.g. payments
webhooks, domain whois): add a `skipXPublicApi(c)` predicate, then either (a)
compose multiple predicates or (b) replace with a single
`createPathPrefixSkipPredicate` from `@panel1/core` middleware. Currently only
catalog needs it, so a single function suffices.

The module side simply places public routes under `/public/*` inside its Hono
router.

---

## 12. Frontend: `apps/web/src/api/catalogApi.ts`

Plain fetch wrapper — **not** React Query hooks. React Query is only used at
page/hook level.

* `base()` → `${getApiBaseUrl()}/api/catalog` from `./http.ts`.
* `fetchJson<T>(url, init?)` (auth Bearer header from `localStorage.auth_token`,
  `Content-Type: application/json`, throws on non‑OK with `{error|message}` JSON
  fallback).
* `fetchJsonPublic<T>` — same but no auth header, used for `/public/products`.
* Exports a flat object `catalogApi = { listPublicProducts, getProviders,
  getProviderHealth, listComponents, getComponentDefinition,
  createComponentDefinition, updateComponentDefinition,
  deleteComponentDefinition, registerComponent, updateRegisteredComponent,
  validateComponentKey, getComponentRegistrationStats, listProducts, getProduct,
  createProduct, updateProduct, deleteProduct, searchProducts,
  checkInstanceHealth, restartInstance, updateInstanceConfiguration,
  scaleInstance, getInstanceStatus, listLegacyPlans, getLegacyPlan,
  createLegacyPlan, updateLegacyPlan, deleteLegacyPlan }`.
* Weak typing (`unknown`, `unknown[]`) except `LegacyPlanRow`. Will be replaced by
  orval-generated types in Phase 5.3.

Consumers (found via `rg 'catalogApi'` in `apps/web/src`):

* `apps/web/src/hooks/useComponentManagement.ts`
* `apps/web/src/hooks/usePlans.ts`
* `apps/web/src/pages/admin/catalog/CatalogDashboard.tsx`
* `apps/web/src/pages/admin/catalog/ProductsManagement.tsx`
* `apps/web/src/pages/admin/catalog/ComponentRegistrationManagement.tsx`
* `apps/web/src/pages/admin/catalog/components/{ComponentForm,ComponentDetails,ProductBuilder,ComponentHealthMonitor,ComponentList}.tsx`
* `apps/web/src/pages/store/ProductStorePage.tsx`

Pattern for sibling APIs already live: `auditApi.ts`, `supportApi.ts`,
`paymentsApi.ts`, `billingApi.ts` all follow the same shape.

---

## 13. Schema location split (roadmap 3.6)

Both exist **in parallel** today:

| Physical DB table         | `apps/api/src/db/schema/…`                       | `modules/catalog/src/schema.ts` |
|---------------------------|---------------------------------------------------|---------------------------------|
| `component_providers`     | `componentProviders.ts`                          | `componentProviders` |
| `components`              | `catalog.ts` (richer: has `type` enum, FKs)      | `components` (no FKs, leaner JSONB metadata shape) |
| `products`                | `catalog.ts`                                     | `products` |
| `product_components`      | `catalog.ts`                                     | `productComponents` |
| `billing_plans`           | `catalog.ts` (`price` decimal, `interval` enum)  | `billingPlans` (`basePrice` varchar, `interval` varchar) |
| `subscribed_components`   | `catalog.ts`                                     | `subscribedComponents` |
| `plan_components`         | `catalog.ts`                                     | — (not in module) |
| `plans`                   | `plans.ts`                                       | `plans` |
| `subscription_components` | `subscription-components.ts` (different table!)  | — |

Migrations are generated only from `apps/api/src/db/schema/*` (see §10). The
module's `schema.ts` is a **parallel, FK‑free mirror** used only by
`DbManager`'s Drizzle instance for relational queries via `ctx.db`. Both
Drizzle instances (the module merged one and the host `apps/api/src/db/index.ts`
one) hit the exact same Postgres tables.

Roadmap item **3.6** (“Per-Module DB Schema Ownership”) will collapse this
duplication: move schema files out of `apps/api/src/db/schema/` into their
modules, point drizzle-kit at `modules/*/src/schema.ts`, keep only genuinely
cross‑cutting tables (tenants, users, roles, event_outbox) in `apps/api`.

---

## 14. Shims, TODOs, gaps to watch

1. **Relative-path host import** in `CatalogService.ts`:
   ```ts
   import { getPanel1CatalogRuntime }
     from '../../../apps/api/src/lib/catalog/catalogRuntime.js';
   ```
   Breaks module isolation. Replicate only if a truly cross-cutting long-lived
   service must be exposed; prefer `ctx.service('peer')` when possible.

2. **Local `Db` type alias** (`type Db = … any`) + `this.db: Db` cast. Symptom
   of merged schema typings not flowing through `ModuleContext['db'] = unknown`.
   Every new module will hit this; keep the same workaround until `ctx.db` is
   generically typed.

3. **Duplicate `billing_interval` enum** declared both in
   `apps/api/src/db/schema/catalog.ts` and in `modules/catalog/src/schema.ts`
   (`billingIntervalLegacyEnum`). Works because Postgres only materializes the
   first; do not double‑declare enums across module + host for new modules.

4. **No FKs in module schema**. Intentional, but means referential integrity is
   enforced only by the mirror tables in `apps/api/src/db/schema/*`. If a module
   schema ever moves to be the source of truth (phase 3.6), bring FKs with it.

5. **No automatic migration generation** from `modules/*/src/schema.ts`.
   drizzle-kit still points at `apps/api/src/db/schema/*`. Don’t author a new
   module schema expecting `npm run db:generate` to Just Work.

6. **No-op `build` script** (`"echo … skip isolated tsc"`). Module types are
   validated transitively by `apps/api`. Running `tsc` directly in
   `modules/catalog/` fails because of the `apps/api/src/lib/catalog/catalogRuntime.js`
   import.

7. **Plain `Hono` (not `OpenAPIHono`)**. Request validation with `zod.parse`,
   but no OpenAPI spec emitted. Future modules should remain consistent until
   Phase 5.3 flips everyone to OpenAPIHono + orval.

8. **Tests do not live inside the module** (no `__tests__/` under
   `modules/catalog/src/`). They live under `apps/api/src/__tests__/` and
   `apps/api/src/lib/catalog/__tests__/`.

9. **Permissions contract is stringly‑typed**. Modules that declare new
   permissions MUST also update `apps/api/src/scripts/seed-rbac-data.ts` role
   bindings to assign them; otherwise `seedModulePermissionsFromDefinitions`
   creates orphan rows nobody has.

10. **EventMap merge not performed**. `ctx.emit('catalog.product.deleted', …)`
    is an untyped string overload. If future modules need typed handlers across
    module boundaries, augment `@panel1/types`' `EventMap` via module
    declaration or a central merge.

11. **tenantId semantics**. Some catalog tables have `tenantId: uuid('tenant_id')`
    nullable (components, products, plans), others not null (billingPlans,
    subscribedComponents). Routes read `tenantId` from the authenticated user;
    public/storefront bypasses this. Mirror the same pattern when migrating
    billing/subscriptions etc. to avoid cross-tenant leaks.

12. **Express→Hono bridge is temporary** (`app.all('/api/*', …)` in
    `apps/api/src/index.ts`). Modules should not assume Express-specific APIs.
    Deleted in Phase 5.4.

---

## Template checklist for the next module

When scaffolding `modules/<name>/`:

- [ ] `package.json` with `@panel1/mod-<name>`, deps = `@panel1/types`,
      `@panel1/core`, `drizzle-orm`, `hono`, `zod`; `build` no-op, `lint` eslint.
- [ ] `tsconfig.json` extending root with `rootDir: ./src` and path aliases.
- [ ] `src/index.ts` with `defineModule({ name, version, deps, schema, config,
      permissions, emits, setup })`.
- [ ] `src/schema.ts` with plain `pgTable` (no cross-module FKs), relations only
      within module, exported as single `<name>Schema` literal.
- [ ] `src/<Name>Service.ts` (class, ctx‑only state, `this.ctx.db`, `ctx.emit`).
- [ ] `src/routes.ts` exporting `<name>Routes(ctx): Hono` (or `OpenAPIHono` after
      phase 5.3) — `routePerm(ctx, ...)` helper + zod validation.
- [ ] `src/types.ts` with `I<Name>Service` and any DTO interfaces.
- [ ] `src/seed-permissions.ts` (`SEED_PERM` const) — strings mirrored in
      `index.ts` + `seed-rbac-data.ts`.
- [ ] Add package name to `apps/api/src/config.ts` `modules = [...]`.
- [ ] Add package name to `apps/api/package.json` `dependencies`.
- [ ] If storefront/public: extend skip predicate in
      `apps/api/src/hono/security.ts`.
- [ ] If long-lived host singletons needed: add
      `apps/api/src/lib/<name>/<name>Runtime.ts` + `setPanel1<Name>Runtime()` in
      `initializeServices()`.
- [ ] Leave Drizzle migrations in `apps/api/src/db/migrations/` until Phase 3.6
      (keep a mirror schema file under `apps/api/src/db/schema/` or wait for the
      big flip).
- [ ] Frontend: add `apps/web/src/api/<name>Api.ts` using `fetchJson` from
      `./http.ts`; pages consume it via React Query.
