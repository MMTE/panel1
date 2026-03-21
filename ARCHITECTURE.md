# Panel1 Architecture

> The Developer-First Billing & Provisioning Platform — a modern open-source WHMCS replacement.

This document defines the target architecture for Panel1. It is the authoritative reference for how modules are structured, how they communicate, and how the system is extended.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [High-Level Overview](#high-level-overview)
3. [Project Structure](#project-structure)
4. [The Module System](#the-module-system)
5. [Module Contract](#module-contract)
6. [Module Context](#module-context)
7. [Inter-Module Communication](#inter-module-communication)
8. [Extension Interfaces](#extension-interfaces)
9. [Event System](#event-system)
10. [Database & Schema Ownership](#database--schema-ownership)
11. [API Layer](#api-layer)
12. [Frontend Architecture](#frontend-architecture)
13. [Core Package](#core-package)
14. [Configuration](#configuration)
15. [Microservices Path](#microservices-path)
16. [Influences & Prior Art](#influences--prior-art)

---

## Design Principles

1. **Modules are vertical slices.** Each module owns its schema, services, routes, events, jobs, and UI. A change to billing touches the billing module, not five directories.

2. **Services are the public API.** Modules never import another module's schema or internal code. Cross-module data access goes through service interfaces.

3. **Events are the nervous system.** Every state change emits an event. Modules react to events from other modules asynchronously. This is the pattern Kill Bill has proven over 14 years of production billing.

4. **Filters intercept, actions react.** Synchronous filters can modify or block operations (like WHMCS hooks). Asynchronous subscribers handle side effects (like Medusa events). Both are needed.

5. **Minimal boilerplate.** A module is 2-3 files minimum. One `setup()` function registers everything. No decorators, no DI ceremony. Inspired by Paymenter's pragmatic approach.

6. **Framework-agnostic business logic.** Services are plain TypeScript classes. Only the route adapter touches the HTTP framework (Hono). If Hono is replaced, services stay untouched.

7. **Config as schema.** Modules declare their configuration as Zod schemas. The admin UI auto-renders settings forms from these schemas. No manual form building per module.

8. **Start simple, evolve.** Begin at Paymenter-level simplicity. Grow toward Medusa-level structure only when real needs arise. Don't build abstractions before they're needed.

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────┐
│                    apps/web                          │
│         React SPA (module-contributed pages)         │
│         Consumes REST API via generated client       │
└──────────────────────┬──────────────────────────────┘
                       │ REST + OpenAPI
┌──────────────────────▼──────────────────────────────┐
│                    apps/api                          │
│              Thin Hono shell                         │
│     Loads @panel1/core → discovers & boots modules   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               @panel1/core                           │
│  Module loader · Event bus · Service registry        │
│  Filter chain · Job scheduler · DB manager           │
└──┬───────┬───────┬───────┬───────┬───────┬──────────┘
   │       │       │       │       │       │
┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐
│Cata-│ │Sub- │ │Bill-│ │Pay- │ │Prov-│ │Supp-│  ...
│log  │ │scrip│ │ing  │ │ment │ │ision│ │ort  │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
              modules/ (first-party)

┌─────────────────────────────────────────────────────┐
│                   plugins/                           │
│        Third-party extensions (use same contract)    │
└─────────────────────────────────────────────────────┘
```

---

## Project Structure

```
panel1/
├── apps/
│   ├── api/                        # Thin shell: loads core, boots modules, starts Hono
│   │   └── src/
│   │       ├── index.ts            # Entry point
│   │       └── config.ts           # App-level configuration
│   └── web/                        # React SPA shell
│       └── src/
│           ├── main.tsx
│           ├── App.tsx             # Collects module UI registrations, builds routes
│           └── shell/              # Layout, navigation (populated by modules)
│
├── packages/
│   ├── core/                       # @panel1/core — the framework
│   │   └── src/
│   │       ├── loader.ts           # Module discovery, dependency sort, boot sequence
│   │       ├── context.ts          # ModuleContext factory
│   │       ├── events.ts           # Event bus (async subscribers)
│   │       ├── filters.ts          # Filter chain (sync interceptors)
│   │       ├── services.ts         # Service registry
│   │       ├── jobs.ts             # Job scheduler (BullMQ + cron)
│   │       ├── db.ts               # Database connection, migration runner
│   │       └── types.ts            # ModuleDefinition, ModuleContext types
│   │
│   └── types/                      # @panel1/types — shared contracts
│       └── src/
│           ├── events.ts           # Event name + payload type map
│           ├── services/           # Service interface contracts
│           │   ├── billing.ts      # IBillingService
│           │   ├── subscriptions.ts
│           │   ├── provisioning.ts
│           │   └── ...
│           ├── extensions/         # Standardized extension interfaces
│           │   ├── gateway.ts      # IPaymentGateway
│           │   ├── provisioner.ts  # IProvisioner
│           │   └── registrar.ts    # IRegistrar
│           └── ui.ts               # Page/nav/slot registration types
│
├── modules/                        # First-party business modules
│   ├── catalog/
│   │   ├── package.json            # "@panel1/mod-catalog"
│   │   └── src/
│   │       ├── index.ts            # Module definition (setup + schema + config)
│   │       ├── schema.ts           # Drizzle tables owned by this module
│   │       ├── service.ts          # CatalogService implements ICatalogService
│   │       ├── routes.ts           # Hono sub-app
│   │       └── ui/                 # React components (admin + client pages)
│   │
│   ├── subscriptions/
│   ├── billing/
│   ├── payments/
│   ├── provisioning/
│   ├── domains/
│   ├── ssl/
│   ├── support/
│   ├── dunning/
│   ├── audit/
│   └── analytics/
│
├── plugins/                        # Third-party extensions (same module contract)
│   └── example-plugin/
│
├── docker-compose.yml
├── turbo.json
└── package.json
```

### What lives where

| Directory | Purpose | Who writes it |
|-----------|---------|---------------|
| `packages/core` | Framework: module loading, events, services, DB | Core team only |
| `packages/types` | Shared interfaces and event types | Core team, modules reference |
| `modules/*` | First-party business logic | Core team |
| `plugins/*` | Third-party extensions | Anyone |
| `apps/api` | HTTP shell (Hono + core bootstrap) | Core team only |
| `apps/web` | UI shell (React + module page collection) | Core team only |

---

## The Module System

### Module Discovery

Modules are npm workspace packages under `modules/` and `plugins/`. The module loader reads a configuration that declares which modules are active:

```typescript
// apps/api/src/config.ts
export const modules = [
  '@panel1/mod-catalog',
  '@panel1/mod-subscriptions',
  '@panel1/mod-billing',
  '@panel1/mod-payments',
  '@panel1/mod-provisioning',
  '@panel1/mod-support',
  // disable by removing from this list
];
```

### Boot Sequence

1. **Discover**: Read module list from config, import each module's default export.
2. **Validate**: Check that all declared dependencies are present and active.
3. **Sort**: Topological sort by `deps` field. Modules boot in dependency order.
4. **Schema**: Collect all module schemas, run pending migrations.
5. **Setup**: Call each module's `setup(ctx)` in sorted order. This registers services, routes, events, filters, and jobs.
6. **Mount**: Mount each module's Hono routes under `/api/{module-name}/`.
7. **Start**: Start the event bus, job scheduler, and HTTP server.

### Disable a Module

Remove it from the config array. Its routes, event handlers, and jobs disappear. Other modules degrade gracefully — service calls to a disabled module return null/throw a clear error.

---

## Module Contract

Every module exports a `defineModule()` call:

```typescript
import { defineModule } from '@panel1/core';

export default defineModule({
  // Identity
  name: 'billing',
  version: '0.1.0',
  deps: ['subscriptions'],

  // The single setup function — registers everything
  setup(ctx) {
    // Services (the module's public API)
    ctx.service('billing', new BillingService(ctx));

    // Routes (Hono sub-app)
    ctx.routes(billingRoutes(ctx));

    // Async event subscribers (react to other modules)
    ctx.on('payment.succeeded', handlePaymentSucceeded);
    ctx.on('subscription.renewed', handleSubscriptionRenewed);

    // Sync filters (intercept and modify/block operations)
    ctx.filter('invoice.create', validateInvoiceFilter);

    // Background jobs
    ctx.job('generate-recurring-invoices', '0 1 * * *', generateRecurring);
    ctx.job('send-overdue-reminders', '0 9 * * *', sendOverdueReminders);
  },

  // Drizzle schema owned by this module
  schema: billingSchema,

  // Configuration with Zod validation (admin UI auto-renders form)
  config: z.object({
    taxEnabled: z.boolean().default(true),
    defaultCurrency: z.string().default('USD'),
    invoicePrefix: z.string().default('INV'),
    dueDays: z.number().default(14),
  }),

  // Permissions this module contributes to the RBAC system
  permissions: [
    'invoices.view',
    'invoices.create',
    'invoices.edit',
    'invoices.delete',
    'invoices.send',
  ],

  // Events this module emits (documentation + validation)
  emits: [
    'invoice.created',
    'invoice.sent',
    'invoice.paid',
    'invoice.overdue',
    'invoice.cancelled',
    'invoice.refunded',
  ],

  // UI contributions (admin and client pages, navigation, widgets)
  ui: {
    adminPages: [
      { path: '/invoices', load: () => import('./ui/admin/Invoices') },
      { path: '/billing', load: () => import('./ui/admin/BillingDashboard') },
    ],
    clientPages: [
      { path: '/invoices', load: () => import('./ui/client/MyInvoices') },
    ],
    adminNav: [
      { label: 'Invoices', icon: 'FileText', path: '/invoices', section: 'billing', order: 30 },
      { label: 'Billing', icon: 'DollarSign', path: '/billing', section: 'billing', order: 31 },
    ],
    widgets: [
      { slot: 'admin.dashboard', load: () => import('./ui/admin/RevenueWidget') },
    ],
  },
});
```

### What the setup function can do

| Method | Purpose | Pattern |
|--------|---------|---------|
| `ctx.service(name, impl)` | Register a service (public API of this module) | Medusa |
| `ctx.routes(honoApp)` | Register HTTP routes | Hono sub-app |
| `ctx.on(event, handler)` | Subscribe to async events | Kill Bill |
| `ctx.filter(event, handler)` | Register sync filter (can modify/block) | Directus |
| `ctx.job(name, cron, handler)` | Register background job | Paymenter |
| `ctx.emit(event, payload)` | Emit an event (from within service logic) | Kill Bill |

---

## Module Context

The `ModuleContext` is what each module receives. It provides scoped access to the platform:

```typescript
interface ModuleContext {
  // This module's identity
  moduleName: string;

  // Database: scoped to this module's tables
  db: DrizzleInstance;

  // Access other modules' services (NOT their DB)
  service<T>(name: string): T;

  // Register a service this module provides
  service(name: string, implementation: unknown): void;

  // Register Hono routes
  routes(app: Hono): void;

  // Async event subscription (react to events from any module)
  on(event: string, handler: EventHandler): void;

  // Sync filter registration (intercept operations)
  filter(event: string, handler: FilterHandler): void;

  // Emit an event (persisted to DB, then processed)
  emit(event: string, payload: unknown): Promise<void>;

  // Register a cron job
  job(name: string, cron: string, handler: JobHandler): void;

  // Module configuration (parsed from DB/env via Zod schema)
  config: Record<string, unknown>;

  // Scoped logger
  logger: Logger;

  // Email transport
  email: EmailTransport;

  // Tenant context (for multi-tenant operations)
  tenantId?: string;
}
```

### The critical rule

```
Module A ──service call──▶ Module B's public service (IBillingService)     ✅
Module A ──event──────────▶ Event Bus ──────▶ Module B's subscriber        ✅
Module A ──import──────────▶ Module B's schema/DB/internal code            ❌
```

Modules interact through **service interfaces** and **events**, never through direct database access or internal imports.

---

## Inter-Module Communication

### Synchronous: Service Calls

For when Module A needs data from Module B right now:

```typescript
// Inside billing module's service
const subService = this.ctx.service<ISubscriptionService>('subscriptions');
const subscription = await subService.getById(subscriptionId);
```

The service registry resolves the implementation at runtime. Today it's an in-process call. The interface stays the same if it becomes a network call later.

### Asynchronous: Events

For when Module A's action should trigger Module B's side effect:

```typescript
// In payments module — emit after successful payment
await this.ctx.emit('payment.succeeded', {
  paymentId,
  invoiceId,
  subscriptionId,
  amount,
  currency,
});

// In billing module — subscribed in setup()
ctx.on('payment.succeeded', async (data) => {
  await billingService.markInvoicePaid(data.invoiceId, data.paymentId);
});

// In subscriptions module — also subscribed
ctx.on('payment.succeeded', async (data) => {
  await subscriptionService.activate(data.subscriptionId);
});
```

Multiple modules can subscribe to the same event. Events are processed asynchronously via BullMQ.

### Synchronous: Filters

For when an operation should be interceptable before it happens:

```typescript
// In billing module — emit filter before creating invoice
const invoice = await this.ctx.filter('invoice.create', invoiceData);
// If any filter throws, creation is blocked
// If a filter modifies the payload, the modified version is used

// A tax module could register a filter:
ctx.filter('invoice.create', async (payload) => {
  payload.tax = calculateTax(payload.subtotal, payload.country);
  payload.total = payload.subtotal + payload.tax;
  return payload;
});
```

Filters run synchronously in priority order. They can modify the payload or throw to block the operation. This is equivalent to WHMCS's hook system.

---

## Extension Interfaces

Standardized interfaces for each integration type. These are the contracts that third-party developers implement.

### IProvisioner (Server Modules)

```typescript
interface IProvisioner {
  name: string;
  type: string; // 'cpanel' | 'plesk' | 'docker' | 'custom'

  provision(input: ProvisionInput): Promise<ProvisionResult>;
  suspend(serviceId: string): Promise<void>;
  unsuspend(serviceId: string): Promise<void>;
  terminate(serviceId: string): Promise<void>;
  changePackage(serviceId: string, newPackage: PackageConfig): Promise<void>;
  getUsage(serviceId: string): Promise<UsageData>;
  healthCheck(): Promise<HealthStatus>;

  // Zod schema — admin UI auto-renders the config form
  configSchema: ZodSchema;
}
```

### IPaymentGateway

```typescript
interface IPaymentGateway {
  name: string;
  supportedCurrencies: string[];
  supportsRefunds: boolean;
  supportsRecurring: boolean;

  createPayment(input: PaymentInput): Promise<PaymentResult>;
  capturePayment(paymentId: string): Promise<CaptureResult>;
  refund(paymentId: string, amount?: number): Promise<RefundResult>;
  handleWebhook(payload: unknown, signature: string): Promise<WebhookResult>;

  configSchema: ZodSchema;
}
```

### IRegistrar (Domain Modules)

```typescript
interface IRegistrar {
  name: string;
  supportedTlds: string[];

  checkAvailability(domain: string): Promise<DomainAvailability>;
  register(input: RegisterInput): Promise<RegistrationResult>;
  renew(domain: string, years: number): Promise<RenewalResult>;
  transfer(input: TransferInput): Promise<TransferResult>;
  getNameservers(domain: string): Promise<string[]>;
  setNameservers(domain: string, ns: string[]): Promise<void>;

  configSchema: ZodSchema;
}
```

Each interface includes a `configSchema` field. When an admin configures a gateway/provisioner/registrar in the admin panel, the UI reads the Zod schema and auto-renders the appropriate form fields. No per-integration form code needed.

---

## Event System

### Dual System

| Type | When | Mechanism | Use Case |
|------|------|-----------|----------|
| **Filters** | Before an action | Synchronous, in-process | Validate, modify, or block operations |
| **Events** | After an action | Async via BullMQ | Side effects, cross-module reactions |

### Event Persistence (Kill Bill pattern)

Events are persisted to the database before being dispatched to the queue. This guarantees:

1. No events are lost if the process crashes.
2. Events can be replayed for debugging or onboarding new modules.
3. Events are only dispatched after the DB transaction commits (no ghost events from rolled-back transactions).

### Event Catalog

Each module declares its `emits` array. The combined catalog serves as documentation and can be used for validation (warn if a module subscribes to an event no module emits).

Core events (emitted by the platform):

```
module.loaded        module.unloaded
app.started          app.stopping
```

Module events follow the pattern `{domain}.{action}`:

```
subscription.created     subscription.activated    subscription.renewed
subscription.cancelled   subscription.suspended    subscription.past_due
invoice.created          invoice.sent              invoice.paid
invoice.overdue          invoice.cancelled         invoice.refunded
payment.initiated        payment.succeeded         payment.failed
payment.refunded
provisioning.started     provisioning.completed    provisioning.failed
provisioning.suspended   provisioning.terminated
client.created           client.updated            client.suspended
user.registered          user.login
support.ticket.created   support.ticket.replied    support.ticket.resolved
```

---

## Database & Schema Ownership

### Single Database, Module-Owned Tables

All modules share one PostgreSQL database. Each module owns a set of tables defined in its `schema.ts`. Module table names are prefixed for clarity but this is a convention, not enforced.

### Core-Owned Tables

Always present, managed by `@panel1/core`:

- `tenants` — multi-tenancy scope
- `users` — authentication identity
- `sessions` — user sessions
- `clients` — business entities (linked to users)
- `roles`, `permissions`, `role_permissions`, `user_roles` — RBAC
- `scheduled_jobs` — job queue infrastructure
- `events` — persisted event log

### Module-Owned Tables

Each module defines its tables in a Drizzle schema file:

```typescript
// modules/billing/src/schema.ts
import { pgTable, text, numeric, timestamp } from 'drizzle-orm/pg-core';

export const invoices = pgTable('billing_invoices', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  // ... module's own columns
});

export const invoiceItems = pgTable('billing_invoice_items', { ... });
export const invoiceCounters = pgTable('billing_invoice_counters', { ... });
```

### Per-Module Migrations

Each module has its own migrations directory. The CLI generates migrations per module:

```bash
panel1 db:generate billing      # generates migration for billing module's schema
panel1 db:generate --all        # generates migrations for all modules
panel1 db:migrate               # runs all pending migrations in dependency order
```

---

## API Layer

### Hono + Zod OpenAPI

Routes are defined with `@hono/zod-openapi` for automatic OpenAPI spec generation:

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export function billingRoutes(ctx: ModuleContext) {
  const app = new OpenAPIHono();

  const listInvoices = createRoute({
    method: 'get',
    path: '/invoices',
    responses: {
      200: { content: { 'application/json': { schema: InvoiceListSchema } } },
    },
  });

  app.openapi(listInvoices, async (c) => {
    const invoices = await ctx.service<IBillingService>('billing').list();
    return c.json(invoices);
  });

  return app;
}
```

### Auto-Generated OpenAPI Spec

The shell aggregates all module routes and serves the combined OpenAPI spec at `/api/docs`. This spec is the single source of truth for the API.

### Frontend Client Generation

The React frontend uses [orval](https://orval.dev) to auto-generate typed React Query hooks from the OpenAPI spec:

```bash
orval --input http://localhost:3000/api/docs --output src/api/generated
```

This replaces tRPC with standard REST while maintaining the same type-safe DX: auto-complete, type checking, and generated hooks for queries and mutations.

---

## Frontend Architecture

### Shell + Module Pages

The `apps/web` shell is a thin React app that:

1. Fetches the list of active modules and their UI registrations.
2. Builds the route tree from module-declared `adminPages` and `clientPages`.
3. Builds the navigation sidebar from module-declared `adminNav`.
4. Renders `widgets` in named slots (dashboard, etc.).

All module UI components are **lazy-loaded** via dynamic `import()`.

### No Hardcoded Routes

The shell does not import any module's pages directly. Routes are built dynamically from module registrations. Adding a module automatically adds its pages and nav items.

---

## Core Package

`@panel1/core` is the framework. It provides:

| Component | Responsibility |
|-----------|---------------|
| `loader.ts` | Discover modules, validate deps, topological sort, boot sequence |
| `context.ts` | Create `ModuleContext` instances with scoped access |
| `services.ts` | Service registry — modules register and resolve services |
| `events.ts` | Async event bus backed by BullMQ with DB persistence |
| `filters.ts` | Sync filter chain with priority ordering |
| `jobs.ts` | Cron job registration and BullMQ queue management |
| `db.ts` | Drizzle connection, per-module migration runner |
| `types.ts` | TypeScript types for `ModuleDefinition`, `ModuleContext`, etc. |

The core is approximately 500-800 lines of code. It is intentionally small.

---

## Configuration

### Module Configuration

Each module declares a Zod schema for its config. Configuration values are stored in the database (per-tenant) and validated at boot time.

```typescript
// Module declaration
config: z.object({
  taxEnabled: z.boolean().default(true),
  defaultCurrency: z.string().default('USD'),
})
```

The admin UI reads the Zod schema and auto-renders a settings form. No per-module admin settings page needed.

### App Configuration

App-level config (database URL, Redis URL, SMTP, etc.) is read from environment variables and `.env` files. Not per-tenant.

---

## Microservices Path

The modular monolith design is naturally extractable to microservices. Each module is a potential service boundary.

### What enables extraction

| Today (monolith) | Tomorrow (if needed) |
|-------------------|---------------------|
| `ctx.service('billing')` → in-process call | Same interface → HTTP/gRPC client |
| `ctx.emit('payment.succeeded')` → BullMQ in-process | Same call → message broker between services |
| Module's Drizzle tables in shared DB | Same tables → separate DB |

### What NOT to do now

- Don't use eventual consistency patterns (sagas) — use DB transactions while you can.
- Don't add network boundaries between modules.
- Don't use separate databases per module.
- Don't build API gateways or service mesh.

### When to split

Split a module into a service when:
- It needs to scale independently (e.g., provisioning under heavy load).
- A different team owns it and needs independent deployment.
- It has fundamentally different performance characteristics (e.g., event ingestion in Go, like Lago).

Until then, enjoy the simplicity and performance of a single deployment.

---

## Influences & Prior Art

This architecture is informed by studying 15+ platforms:

| Platform | What We Took |
|----------|-------------|
| **Kill Bill** (Java, YC) | Event-driven core, persistent event bus, plugin-owned DB tables |
| **Lago** (Ruby, YC W23) | API-first, service-per-domain, move fast without over-engineering |
| **Paymenter** (Laravel) | `boot()` simplicity, config-as-data, lifecycle hooks, extension-managed migrations |
| **Medusa.js** (TypeScript) | Module definition pattern, per-module migrations, service container |
| **WHMCS** | Standardized interfaces per module type, 200+ hook points, auto-rendered config forms |
| **Blesta** | Module/Gateway/Plugin type separation, `getModulePermissions()`, `getEvents()` |
| **Directus** | Filter/action hook dichotomy, context injection, collection-scoped events |
| **PocketBase** | `MustRegister(app, config)` simplicity, hook chain with priorities and IDs |
| **Strapi** | Plugin entry file pattern, namespace auto-prefixing, admin+server split |
| **FOSSBilling** | Simple module directory convention, cron via hooks |
| **Fastify** | Encapsulated plugin scopes (informed the isolation model) |
| **Grzybek** | Modular monolith theory: module contracts, vertical slices, encapsulation |

### Key insight from this research

The fast-moving teams (Lago, Paymenter) ship with simple patterns. The mature platforms (Kill Bill, Medusa) evolved complexity over years. Panel1 starts simple and evolves. The module contract is designed to support both extremes without requiring a rewrite.
