# Panel1 Technical Analysis & Roadmap

> Analysis Date: March 2026  
> Status: In Transition (Monolith → Modular Monolith)

---

## Executive Summary

Panel1 is a developer-first billing & provisioning platform (WHMCS replacement). The architecture vision is well-defined in `ARCHITECTURE.md`, but the codebase is ~95% legacy. Two proof-of-concept modules (`support`, `audit`) validate the module system works. The critical path is migrating the core business domains (billing, payments, subscriptions, catalog, provisioning) from scattered tRPC routers + lib code into vertical-slice modules.

### Current State Metrics

| Area | State | Details |
|------|-------|---------|
| `apps/api` | ~28k LOC | 20 tRPC routers, 22 lib directories, Express + tRPC |
| `apps/web` | ~21k LOC | 70 components, hardcoded routes, tRPC client |
| `packages/core` | ✅ Done | Module loader, events, filters, services, jobs (14 files) |
| `packages/types` | ✅ Done | ModuleDefinition, extension interfaces (6 files) |
| `modules/` | 2 modules | `support` and `audit` migrated |
| DB Schema | Monolithic | 26 schema files in single barrel export |

### Gap Analysis

```
Target Architecture                Current Reality
─────────────────────────────────  ─────────────────────────────────
Hono + Zod OpenAPI                 Express + tRPC (all 20 routers)
Vertical-slice modules             Horizontal lib/ directories
Module-owned schemas               Single db/schema/index.ts barrel
orval-generated REST client        tRPC client with direct imports
Dynamic route/nav building         Hardcoded AdminRoutes.tsx
Per-module migrations              Single migration folder
```

---

## Architecture Debt Map

### Backend (`apps/api/src/`)

| Directory | Files | Should Become | Priority |
|-----------|-------|---------------|----------|
| `routers/` | 20 | Hono routes inside modules | P0 |
| `lib/payments/` | 6 | `modules/payments/` | P0 |
| `lib/subscription/` | 2 | `modules/subscriptions/` | P0 |
| `lib/invoice/` | 6 | `modules/billing/` | P0 |
| `lib/catalog/` | 4 | `modules/catalog/` | P0 |
| `lib/provisioning/` | 4 | `modules/provisioning/` | P1 |
| `lib/domains/` | 3 | `modules/domains/` | P1 |
| `lib/ssl/` | 2 | `modules/ssl/` | P1 |
| `lib/dunning/` | 1 | `modules/dunning/` | P1 |
| `lib/components/` | 2 | `modules/catalog/` (merge) | P1 |
| `lib/plugins/` | 7 | Remove (replaced by module system) | P2 |
| `lib/auth/` | 2 | `packages/core/` or `modules/auth/` | P2 |
| `lib/jobs/` | 4 | `packages/core/` (merge with JobScheduler) | P2 |
| `lib/events/` | 1 | `packages/core/` (merge with EventBus) | P2 |
| `lib/email/` | 2 | `packages/core/` | P2 |
| `lib/logging/` | 1 | `packages/core/` | P2 |
| `lib/errors/` | 1 | `packages/core/` | P2 |
| `lib/resilience/` | 1 | `packages/core/` | P2 |
| `lib/security/` | 1 | `packages/core/` | P2 |
| `lib/health/` | 1 | Keep in `apps/api/` | P3 |
| `trpc/` | 3 | Delete after migration | P3 |
| `db/schema/` | 26 | Split into module-owned schemas | P0 |

### Frontend (`apps/web/src/`)

| Area | Current | Target |
|------|---------|--------|
| Route definition | Hardcoded in `AdminRoutes.tsx` | Dynamic from module `ui:` declarations |
| Navigation | Hardcoded in `menuItems.tsx` | Built from module `adminNav` |
| API client | tRPC (`api/trpc.ts`) | orval-generated React Query hooks |
| Pages | 20+ admin pages in `pages/admin/` | Move into respective modules |

---

## Epics & Issues

### Epic 1: Core Module Infrastructure Completion

**Goal**: Ensure `@panel1/core` and `@panel1/types` are production-ready before large-scale migration.

#### Issue 1.1: Add BullMQ backing to EventBus
**Current**: `EventBus` is in-memory only  
**Target**: Persist events to DB, process via BullMQ (Kill Bill pattern)  
**Tasks**:
- [ ] Add `events` table to core schema
- [ ] Modify `EventBus.emit()` to persist before dispatching
- [ ] Create BullMQ worker for async event processing
- [ ] Add retry logic with exponential backoff
- [ ] Add dead-letter queue for failed events

#### Issue 1.2: Add BullMQ backing to JobScheduler
**Current**: `JobScheduler` registers jobs but doesn't execute them  
**Target**: Integrate with existing `JobProcessor` or replace it  
**Tasks**:
- [ ] Connect `JobScheduler` to Redis/BullMQ
- [ ] Migrate cron job definitions from legacy `JobProcessor`
- [ ] Add job status tracking and history
- [ ] Add job retry configuration per-job

#### Issue 1.3: Implement FilterChain persistence
**Current**: Filters registered but no priority system  
**Target**: Priority-ordered sync filters (WHMCS hook pattern)  
**Tasks**:
- [ ] Add priority field to filter registration
- [ ] Implement ordered execution
- [ ] Add filter result caching for performance
- [ ] Add telemetry/logging for filter execution

#### Issue 1.4: Add core infrastructure services
**Target**: Move shared infrastructure into `@panel1/core`  
**Tasks**:
- [ ] Move `Logger` from `lib/logging/` to core
- [ ] Move `EmailService` from `lib/email/` to core
- [ ] Move `EncryptionService` from `lib/security/` to core
- [ ] Move error types from `lib/errors/` to core
- [ ] Move `RetryManager` from `lib/resilience/` to core

---

### Epic 2: Module Migration (Core Business Domains)

**Goal**: Extract the 5 core business domains into vertical-slice modules.

#### Issue 2.1: Create `modules/catalog/`
**Source**: `lib/catalog/`, `lib/components/`, `routers/catalog.ts`, `routers/components.ts`, `db/schema/catalog.ts`, `db/schema/componentProviders.ts`  
**Tasks**:
- [ ] Create module scaffold (`index.ts`, `types.ts`, `schema.ts`, `service.ts`, `routes.ts`)
- [ ] Move `ProductService` → `CatalogService`
- [ ] Move `ComponentDefinitionService` → merge into `CatalogService`
- [ ] Move `ComponentProviderRegistry` → service within module
- [ ] Convert tRPC routes to Hono + Zod OpenAPI
- [ ] Move catalog-related pages to `modules/catalog/ui/`
- [ ] Add event emissions (`catalog.product.created`, etc.)
- [ ] Write integration tests

#### Issue 2.2: Create `modules/subscriptions/`
**Source**: `lib/subscription/`, `routers/subscriptions.ts`, `db/schema/subscriptions.ts`, `db/schema/subscription-components.ts`, `db/schema/subscription-state-changes.ts`  
**Tasks**:
- [ ] Create module scaffold
- [ ] Move `SubscriptionService`
- [ ] Move subscription state machine logic
- [ ] Convert tRPC routes to Hono
- [ ] Define events (`subscription.created`, `subscription.activated`, etc.)
- [ ] Subscribe to `payment.succeeded` to activate subscriptions
- [ ] Move admin subscription pages to module

#### Issue 2.3: Create `modules/billing/`
**Source**: `lib/invoice/`, `lib/dunning/`, `routers/invoices.ts`, `db/schema/invoices.ts`, `db/schema/invoice-items.ts`, `db/schema/invoice-counters.ts`, `db/schema/dunning-attempts.ts`  
**Tasks**:
- [ ] Create module scaffold
- [ ] Move `InvoiceNumberService`, `InvoicePDFService`, `InvoiceEmailService`, `TaxCalculationService`
- [ ] Move `DunningManager`, `DunningEmailService`
- [ ] Move `ComponentInvoiceService` (or integrate into billing)
- [ ] Convert tRPC routes to Hono
- [ ] Define events (`invoice.created`, `invoice.paid`, `invoice.overdue`)
- [ ] Register dunning cron jobs via `ctx.job()`
- [ ] Move admin invoice pages to module

#### Issue 2.4: Create `modules/payments/`
**Source**: `lib/payments/`, `routers/payment-gateways.ts`, `db/schema/payments.ts`, `db/schema/payment-gateways.ts`  
**Tasks**:
- [ ] Create module scaffold
- [ ] Move `PaymentService`, `PaymentGatewayService`, `PaymentGatewayManager`
- [ ] Move `PaymentEventHandler` logic into module event subscribers
- [ ] Move gateway implementations (`StripeGateway`, etc.)
- [ ] Implement `IPaymentGateway` interface from `@panel1/types`
- [ ] Convert tRPC routes to Hono
- [ ] Define events (`payment.initiated`, `payment.succeeded`, `payment.failed`)
- [ ] Move admin payment gateway pages to module

#### Issue 2.5: Create `modules/provisioning/`
**Source**: `lib/provisioning/`, `routers/provisioning.ts`, `db/schema/provisioning.ts`  
**Tasks**:
- [ ] Create module scaffold
- [ ] Move `ProvisioningManager`
- [ ] Move `CpanelAdapter` and `CpanelPlugin`
- [ ] Implement `IProvisioner` interface from `@panel1/types`
- [ ] Subscribe to `subscription.activated` to trigger provisioning
- [ ] Define events (`provisioning.started`, `provisioning.completed`, `provisioning.failed`)
- [ ] Convert tRPC routes to Hono
- [ ] Move admin provisioning pages to module

---

### Epic 3: Secondary Module Migration

#### Issue 3.1: Create `modules/domains/`
**Source**: `lib/domains/`, `lib/plugins/domain/`, `db/schema/domains.ts`  
**Tasks**:
- [ ] Create module scaffold
- [ ] Move `DomainManager`, `DomainComponentHandler`
- [ ] Move `NamecheapRegistrar` and implement `IRegistrar` interface
- [ ] Convert domain plugin router to Hono routes
- [ ] Define events (`domain.registered`, `domain.renewed`, etc.)

#### Issue 3.2: Create `modules/ssl/`
**Source**: `lib/ssl/`, `lib/plugins/ssl/`, `db/schema/ssl-certificates.ts`  
**Tasks**:
- [ ] Create module scaffold
- [ ] Move `SslCertificateManager`, `SslComponentHandler`
- [ ] Convert SSL plugin router to Hono routes
- [ ] Define events (`ssl.issued`, `ssl.renewed`, `ssl.expired`)

#### Issue 3.3: Enhance `modules/audit/` (already exists)
**Tasks**:
- [ ] Subscribe to events from other modules
- [ ] Add automatic audit logging middleware
- [ ] Add export functionality
- [ ] Add retention policy enforcement job

#### Issue 3.4: Enhance `modules/support/` (already exists)
**Tasks**:
- [ ] Implement SLA enforcement logic
- [ ] Implement ticket automation rules
- [ ] Add knowledge base functionality
- [ ] Subscribe to relevant events (client created, subscription issues)

---

### Epic 4: Frontend Module Architecture

**Goal**: Make frontend dynamically load routes/nav from module declarations.

#### Issue 4.1: Create module manifest endpoint
**Tasks**:
- [ ] Add `/api/modules/manifest` endpoint in `apps/api`
- [ ] Return active modules with their `ui` declarations
- [ ] Include permissions, nav items, page paths

#### Issue 4.2: Dynamic route building in `App.tsx`
**Tasks**:
- [ ] Fetch module manifest on app load
- [ ] Build React Router routes dynamically from manifest
- [ ] Implement lazy loading for module page components
- [ ] Remove hardcoded routes from `AdminRoutes.tsx`

#### Issue 4.3: Dynamic navigation building
**Tasks**:
- [ ] Build sidebar from module `adminNav` declarations
- [ ] Sort by section and order fields
- [ ] Gate nav items by permissions
- [ ] Remove hardcoded `menuItems.tsx`

#### Issue 4.4: Replace tRPC with orval-generated client
**Tasks**:
- [ ] Add `/api/docs` OpenAPI spec endpoint (aggregate all module specs)
- [ ] Set up orval configuration
- [ ] Generate React Query hooks from OpenAPI spec
- [ ] Migrate pages from tRPC hooks to generated hooks
- [ ] Remove `@trpc/client` and `@trpc/react-query` dependencies

---

### Epic 5: Database Schema Migration

**Goal**: Split monolithic schema into module-owned schemas with per-module migrations.

#### Issue 5.1: Design schema ownership map
**Tasks**:
- [ ] Document which tables belong to which module
- [ ] Identify cross-module foreign keys (need careful handling)
- [ ] Decide on table naming convention (`{module}_tablename`)

#### Issue 5.2: Implement per-module migrations
**Tasks**:
- [ ] Extend `DbManager` to run migrations per-module in dependency order
- [ ] Create migration CLI (`panel1 db:generate {module}`, `panel1 db:migrate`)
- [ ] Migrate existing tables to new naming convention (if needed)

#### Issue 5.3: Split schema files
**Tasks**:
- [ ] Move `db/schema/invoices.ts` → `modules/billing/src/schema.ts`
- [ ] Move `db/schema/payments.ts` → `modules/payments/src/schema.ts`
- [ ] Move `db/schema/subscriptions.ts` → `modules/subscriptions/src/schema.ts`
- [ ] Move `db/schema/catalog.ts` → `modules/catalog/src/schema.ts`
- [ ] Move `db/schema/provisioning.ts` → `modules/provisioning/src/schema.ts`
- [ ] Keep core tables (users, clients, tenants, roles) in `@panel1/core` or `apps/api`

---

### Epic 6: API Migration (tRPC → Hono)

**Goal**: Replace Express + tRPC with Hono + Zod OpenAPI.

#### Issue 6.1: Replace Express with Hono in `apps/api`
**Tasks**:
- [ ] Replace Express app with Hono app in `index.ts`
- [ ] Migrate CORS, helmet, and health check to Hono middleware
- [ ] Mount module routes directly (remove Express adapter hack)
- [ ] Add OpenAPI spec aggregation endpoint

#### Issue 6.2: Migrate auth router
**Tasks**:
- [ ] Convert `routers/auth.ts` to Hono routes
- [ ] Use Zod schemas for request/response validation
- [ ] Decide: keep in `apps/api` or create `modules/auth`

#### Issue 6.3: Remove tRPC infrastructure
**Tasks**:
- [ ] Delete `trpc/` directory after all routers migrated
- [ ] Remove tRPC dependencies from `package.json`
- [ ] Update frontend to use generated REST client

---

### Epic 7: Legacy Cleanup

#### Issue 7.1: Remove old plugin system
**Source**: `lib/plugins/` (PluginManager, BasePlugin, etc.)  
**Tasks**:
- [ ] Ensure all plugin functionality moved to modules
- [ ] Delete `lib/plugins/` directory
- [ ] Remove `PluginManager.getInstance()` calls from `index.ts`
- [ ] Remove stub files in frontend (`lib/plugins/index.ts`, `lib/marketplace/`)

#### Issue 7.2: Consolidate job processing
**Tasks**:
- [ ] Merge `lib/jobs/JobProcessor` into `@panel1/core` JobScheduler
- [ ] Migrate processor implementations to module jobs
- [ ] Delete `lib/jobs/` after migration

#### Issue 7.3: Consolidate event processing
**Tasks**:
- [ ] Merge `lib/events/EventService` into `@panel1/core` EventBus
- [ ] Merge `lib/jobs/processors/EventProcessor` into EventBus
- [ ] Delete legacy event infrastructure

---

## Recommended Execution Order

### Phase 1: Foundation (Issues 1.1-1.4)
Complete `@panel1/core` with production-ready event bus, job scheduler, and infrastructure services. This unblocks all module migrations.

### Phase 2: First Business Module (Issue 2.3 - Billing)
Billing is the heart of the system. Migrating it first proves the pattern at scale and creates a reference implementation for other modules.

### Phase 3: Payment + Subscription (Issues 2.4, 2.2)
These depend on billing and are tightly coupled. Migrate together to establish cross-module event communication.

### Phase 4: Catalog + Provisioning (Issues 2.1, 2.5)
Product catalog and provisioning are the other critical paths. Complete these to have a functional billing→payment→provisioning flow.

### Phase 5: Secondary Modules (Issues 3.1-3.4)
Domains, SSL, and enhancements to support/audit.

### Phase 6: Frontend Migration (Issues 4.1-4.4)
Once backend modules are stable, migrate frontend to dynamic loading and generated API client.

### Phase 7: Cleanup (Issues 7.1-7.3, 6.3)
Remove legacy code after everything is migrated.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes during migration | High | Run legacy and new systems in parallel, feature-flag new paths |
| Cross-module type coupling | Medium | Strict `import type` enforcement, no runtime cross-module imports |
| Migration takes too long | Medium | Migrate incrementally, ship each module independently |
| Frontend/backend desync | Medium | Generate API client from OpenAPI spec, typed end-to-end |
| Event ordering issues | Low | BullMQ handles ordering within queues, design events to be idempotent |

---

## Success Metrics

- [ ] Zero tRPC routers remaining in `apps/api/src/routers/`
- [ ] Zero files in `apps/api/src/lib/` (all moved to modules or core)
- [ ] All 10+ modules defined in `apps/api/src/config.ts`
- [ ] Frontend routes 100% dynamic (no hardcoded paths)
- [ ] API client 100% generated (no manual tRPC types)
- [ ] Per-module migration system working
- [ ] Event bus processing 1000+ events/minute reliably

---

## Quick Reference: Module Scaffold

When creating a new module, use this structure:

```
modules/{name}/
├── package.json          # "@panel1/mod-{name}"
├── tsconfig.json
└── src/
    ├── index.ts          # defineModule({ ... })
    ├── types.ts          # Public interface (I{Name}Service, DTOs, event types)
    ├── schema.ts         # Drizzle tables owned by this module
    ├── service.ts        # Service implementation
    ├── routes.ts         # Hono sub-app with Zod OpenAPI
    └── ui/               # React components (optional)
        ├── admin/
        └── client/
```

### Minimal `index.ts`:

```typescript
import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { schema } from './schema.js';
import { MyService } from './service.js';
import { routes } from './routes.js';

export default defineModule({
  name: 'my-module',
  version: '0.1.0',
  deps: [],
  schema,
  config: z.object({
    // module config with defaults
  }),
  permissions: [
    'my-module.view',
    'my-module.manage',
  ],
  emits: [
    'my-module.created',
    'my-module.updated',
  ],
  setup(ctx) {
    const service = new MyService(ctx);
    ctx.service('my-module', service);
    ctx.routes(routes(ctx));
    
    // Subscribe to events from other modules
    ctx.on('other.event', async (data) => {
      // handle
    });
    
    // Register cron jobs
    ctx.job('my-job', '0 * * * *', async () => {
      // hourly job
    });
  },
});

export type { IMyService } from './types.js';
```
