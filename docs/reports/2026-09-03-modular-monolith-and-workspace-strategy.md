# Panel1 Modular Monolith & Workspace Strategy

**Date:** 2026-09-03  
**Status:** Decision record and implementation guide  
**Scope:** `apps/*`, `packages/*`, and `modules/*`

## Executive decision

Panel1 should continue toward a **modular monolith**: one deployable application, one operational database, and independently evolvable domain modules. Modules should not be treated as independently deployed microservices or as arbitrary third-party plugins.

Panel1 should **not perform a full Nx migration yet**. Continue with pnpm workspaces, Turbo, and Changesets while repairing the actual module contracts. Introduce Nx incrementally later if its boundary enforcement, generators, and affected-only CI solve an observed maintainer problem.

Open sourcing Panel1 is compatible with Nx, but is not a reason to adopt it. If Nx is introduced, normal contributor commands must remain pnpm-based; Nx should initially be a maintainer and CI capability, without requiring Nx Cloud.

## Current position

### Freshness

| Evidence | Latest change |
|---|---|
| Repository commit | 2026-09-03 — documentation/planning |
| Workspace tooling | 2026-08-09 — pnpm, Turbo, type-check configuration |
| TypeScript source | 2026-07-14 — modular migration work |

The architectural documentation is ahead of the currently validated implementation.

### Intended architecture

```text
apps/web ──HTTP──> apps/api
                     │
                     ▼
              @panel1/core
       loader · services · events · jobs
                     │
                     ▼
 audit · catalog · billing · payments
 subscriptions · provisioning · support
```

The architecture specification declares that modules own their schema, services, routes, events, jobs, and UI; they communicate through public services and events rather than another module's internal code or schema. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

### Observed implementation state

```text
apps/api
├── legacy Express + tRPC routes
│   └── direct reads of central schemas
├── dynamic module loader
│   ├── audit        configured and resolvable
│   ├── support      configured but not declared by API
│   ├── payments     configured but not declared by API
│   └── billing      configured but not declared by API
└── @panel1/core
    └── one merged Drizzle database handle for all modules

catalog ──imports──> apps/api runtime code
subscriptions ──raw SQL──> catalog tables
```

The API configuration enables audit, support, payments, and billing, while its package manifest declares workspace dependencies only for audit and the currently disabled catalog module. Under pnpm's strict resolution, this leaves the configured system able to start in degraded mode instead of as the declared module set.

## Independence assessment

The target is **independent development**, not total isolation.

| Module | Directional independence | Current condition |
|---|---:|---|
| Audit | 65% | Isolated type-check passes; integration suite exists; migration ownership remains incomplete. |
| Support | 50% | Isolated type-check passes; API dependency declaration and migration ownership are incomplete. |
| Billing | 45% | Strong ledger tests, but isolated type-check currently fails and it reaches host-owned client data. |
| Payments | 35% | Isolated type-check fails because of dependency-version drift; no module test target. |
| Subscriptions | 35% | Type-check passes, but it reads catalog tables using raw SQL and renewal is not yet idempotent. |
| Provisioning | 30% | Type-check passes, but it is deferred and the cPanel adapter is a stub. |
| Catalog | 20% | Imports host code and intentionally skips isolated TypeScript validation. |

Observed verification:

- Four of seven modules currently type-check in isolation: audit, support, subscriptions, and provisioning.
- Billing, payments, and catalog fail isolated type-checking.
- Core and billing-ledger tests pass when run directly: 93 tests total.
- Module packages do not currently expose `test` scripts, so those checks are not consistently orchestrated by the workspace test command.

## Main architectural risks

### Schema ownership is split

Twenty physical table names are defined both in `apps/api/src/db/schema` and in modules. Examples include `products`, `plans`, `subscriptions`, `invoices`, `payments`, and `service_instances`.

The Drizzle configuration includes the legacy application schemas plus only the billing ledger schema. Most module schemas have no migration path. The runtime database manager merges all discovered schemas and gives every module the same database instance.

**Decision:** every table must have exactly one canonical module owner. Keep one ordered migration stream for the modular monolith, generated from canonical module-owned schemas as a deployment step. Do not run migrations dynamically during application boot.

### Hidden cross-module dependencies

Subscriptions reads catalog data through raw SQL (`plans` and `product_components`). Billing and legacy routes read client data directly. This is still coupling even when it avoids TypeScript imports.

**Decision:** model cross-domain needs as one of:

1. a public service/port for synchronous reads;
2. a typed domain event for asynchronous work; or
3. an explicitly owned reporting/read-model boundary for analytics.

The API host must not keep operational queries into a module's owned data after that module has migrated.

### Contracts are not fully enforced

The module context permits generic string events and untyped payloads, and several consumers cast payloads manually. Static package boundaries are also not enforced by ESLint.

**Decision:** every module will declare:

```text
provides: service contracts
requires: mandatory services/capabilities
consumes: domain events
emits: domain events
owns: schemas/tables
```

Hard service dependencies determine boot order. Event consumption is recorded for visibility and contract validation, but need not create a hard boot dependency.

## Target module model

```text
Platform kernel — always enabled
├── tenancy / identity / permissions
├── configuration
├── database and migration orchestration
└── events and jobs

Optional domain modules
├── audit
└── support

Commerce capability group
catalog
  └─> subscriptions
        ├─ renewal requested ─> billing ─> invoice issued ─> payments
        └─ lifecycle events ───────────────────────────────> provisioning

All material domain events ────────────────────────────────> audit
```

The temporal payments/billing/subscriptions loop is acceptable only when all handlers are idempotent and event delivery is observable. It must not become a compile-time package cycle.

## Definition of a healthy module

A module is considered independent enough for Panel1 when it:

1. builds, lints, and tests through its own workspace targets;
2. imports only the platform kernel and explicit public contracts;
3. has no import from `apps/*` or another module's internals;
4. is the canonical owner of its tables and schema definitions;
5. declares required services and consumed/emitted events;
6. passes a boot/removability test when disabled, or reports its missing capability clearly;
7. leaves the API host with no direct operational access to its tables.

This permits a single deployment and shared transactions while protecting domain boundaries.

## Workspace-tool decision: Turbo now, Nx later

### Why not migrate immediately

Nx would not fix duplicate schemas, missing dependencies, raw SQL coupling, deferred modules, or untyped events. Migrating before those corrections would add configuration and contributor cognitive load without producing a trustworthy dependency graph.

Turbo already provides the required basic workspace task orchestration. Changesets already provides an appropriate release mechanism for public npm packages.

### When Nx becomes justified

Adopt minimal Nx when two or more of the following are true:

- multiple active maintainers are changing separate modules concurrently;
- CI duration makes affected-only execution materially valuable;
- forbidden imports or accidental coupling recur;
- a generator is needed to create modules consistently;
- maintainers need a project graph across a growing module ecosystem;
- Tess needs a common policy for several repositories.

### Minimal open-source-friendly Nx shape

```text
Contributor interface
├── pnpm install
├── pnpm dev
├── pnpm test
└── pnpm --filter @panel1/mod-billing test

Maintainer / CI interface
├── pnpm nx affected -t lint,type-check,test,build
├── pnpm nx graph
└── pnpm nx g @panel1/workspace:module
```

If adopted, Nx should start as a normal dev dependency added with `nx init` to the existing pnpm workspace. Turbo may remain in place until Nx configuration and CI are proven equivalent. Do not require Nx Cloud. If remote caching is enabled later, only protected-branch CI may write to the cache; public pull requests must use read-only or isolated access.

Suggested tags and boundary direction:

```text
type:app | type:core | type:contracts | type:module
scope:audit | scope:billing | scope:payments | ...

apps            -> core, contracts, public module APIs
modules         -> core, contracts, explicitly allowed public APIs
modules         -X-> apps
module A        -X-> module B internals
core/contracts  -X-> modules and apps
```

Nx cannot infer dynamic imports, service-registry strings, event names, or raw SQL. A Panel1 module generator must translate the module manifest into Nx tags and implicit dependency metadata.

## Execution order

1. Make API package dependencies match the enabled module list.
2. Restore isolated build correctness for all seven modules.
3. Add `test` and `type-check` targets to every module; ensure root CI runs them.
4. Align shared dependency versions, particularly Hono, OpenAPI, Stripe, and Drizzle tooling.
5. Assign canonical table ownership and remove duplicate schema definitions incrementally.
6. Establish one migration orchestration path from those canonical schemas.
7. Remove catalog's host import and replace raw SQL cross-domain reads with contracts or reporting models.
8. Add typed event/service contracts and idempotency tests for critical handlers.
9. Only then evaluate a minimal Nx adoption and enforce the boundary rules above.

## Public package policy

Do not publish every workspace package merely because Panel1 is open source. Start with a small supported public surface:

```text
Potential public packages
├── @panel1/core
├── @panel1/types (or a renamed contracts package)
└── selected stable extension/module SDK packages

Keep internal initially
├── apps/api
├── apps/web
├── migration orchestration
└── experimental first-party modules
```

Changesets remains suitable for publishing versioned public packages. Nx Release can be evaluated only if it offers a concrete advantage over that established flow.

## References

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — declared modular-monolith design.
- [`apps/api/src/config.ts`](../../apps/api/src/config.ts) — enabled module list.
- [`apps/api/package.json`](../../apps/api/package.json) — API workspace dependencies.
- [`packages/core/src/loader.ts`](../../packages/core/src/loader.ts) and [`packages/core/src/db.ts`](../../packages/core/src/db.ts) — actual module boot and DB wiring.
- [`apps/api/drizzle.config.ts`](../../apps/api/drizzle.config.ts) — current migration schema inputs.
- [Nx: existing pnpm workspaces](https://nx.dev/docs/getting-started/tutorials/crafting-your-workspace)
- [Nx: enforce module boundaries](https://nx.dev/docs/features/enforce-module-boundaries)
- [Nx: cache security for open-source repositories](https://nx.dev/docs/kb/cache-security)
