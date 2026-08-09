# AGENTS.md

## Build & Development Commands

```bash
# Start all services (API + Web) in parallel
pnpm dev

# Start individual services (use --filter to scope commands to one package)
pnpm dev:api             # API only (tsx watch, port 3001)
pnpm dev:web             # Web only (Vite, port 5173)
pnpm --filter @panel1/api dev   # explicit filter form

# Build / type-check / lint / test (all via turbo, affected-only in CI)
pnpm build               # All workspaces via turbo
pnpm type-check          # TypeScript checking via turbo
pnpm lint                # All workspaces via turbo
pnpm test                # All workspaces via turbo

# Test a single package or file
pnpm --filter @panel1/api test
pnpm --filter @panel1/core test
pnpm --filter @panel1/api exec vitest run src/path/to/file.test.ts
pnpm --filter @panel1/api test:hono        # Vitest: Hono security + integration (audit/support when DB + tables exist)
pnpm --filter @panel1/api test:integration # Vitest: only `src/__tests__/integration` (same conditions)

# Database (Drizzle ORM + PostgreSQL)
pnpm db:generate         # Generate migration from schema changes
pnpm db:migrate          # Push schema to database
pnpm db:studio           # Open Drizzle Studio GUI
pnpm --filter @panel1/api exec tsx src/db/seed.ts  # Seed database

# Versioning (Changesets — never edit package.json versions by hand)
pnpm changeset           # Create a changeset describing the change
pnpm changeset version   # Apply pending changesets, bump versions

# Infrastructure (required before dev)
docker compose up -d     # PostgreSQL (5432), Redis (6379), MailHog (SMTP 1025, UI 8025)
```

## Package Manager

**pnpm** is the only supported package manager. The `preinstall` script blocks `npm install` and `yarn install`. Internal workspace dependencies use the `workspace:*` protocol (e.g. `"@panel1/core": "workspace:*"`). The `packageManager` field in root `package.json` pins the exact pnpm version via Corepack.

Never use `npm install`, `yarn`, or bare `npm run` — always use `pnpm`.

## Architecture

**Target architecture** is defined in [ARCHITECTURE.md](./ARCHITECTURE.md). The codebase is in transition from the old monolithic layout to a modular monolith with vertical-slice modules.

### Current State (in transition)

**Monorepo** using pnpm workspaces + Turborepo. Modular packages and the first vertical-slice module are in place; more modules are being extracted from the monolith.

| Workspace | Package Name | Purpose |
|-----------|-------------|---------|
| `apps/api` | `@panel1/api` | Express + tRPC backend (port 3001) — will become thin Hono shell |
| `apps/web` | `@panel1/web` | React + Vite frontend (port 5173) — will become dynamic module-based shell |
| `packages/core` | `@panel1/core` | Module framework — loader, event bus, service registry, filter chain, job scheduler |
| `packages/types` | `@panel1/types` | Shared framework contracts and types (runtime-free) |
| `modules/audit` | `@panel1/mod-audit` | First vertical-slice module — audit logging (schema, service, routes) |

### Backend (`apps/api/src/`)

- **Entry point**: `index.ts` — Express server with tRPC middleware and service initialization. Will be replaced with Hono.
- **`hono/`** — Modular `/api/*` stack: Bearer auth + tenant-from-user + RBAC (`security.ts`); `bootModules({ requirePermission })` wires per-route checks in `modules/*`.
- **`routers/`** — tRPC router files (20 files). Business logic here needs extraction into module services, then rewriting as Hono routes.
- **`trpc/`** — tRPC setup. Will be removed when migrating to Hono + Zod OpenAPI.
- **`db/schema/`** — Drizzle ORM schema files (26 files, monolithic barrel). Will be split so each module owns its own `schema.ts`.
- **`db/index.ts`** — Database connection. Note: `db/schema/index.ts` has a duplicate db connection — use only `db/index.ts`.
- **`lib/`** — Domain logic scattered across 22 subdirectories. Each will be migrated into its own `modules/{name}/` vertical slice. Core infrastructure (`events/`, `jobs/`, `logging/`, `email/`, `security/`, `resilience/`, `errors/`) will move into `packages/core/`.
- **`scripts/`** — Seed scripts (`seed-catalog-data.ts`, `seed-rbac-data.ts`, `setup-payment-gateways.ts`, `encrypt-existing-secrets.ts`).

### Frontend (`apps/web/src/`)

- **`App.tsx`** — React Router v6 with hardcoded routes. Will become a dynamic shell.
- **`routes/AdminRoutes.tsx`** — Hardcoded admin routes with permission-gated components. Will be replaced by module UI declarations.
- **`api/trpc.ts`** — tRPC client. Will be replaced by orval-generated REST client.
- **`pages/`** — Admin (~20 pages), client portal, store pages. These will move into their respective modules.
- **`lib/plugins/index.ts`** — Stub file (old plugin system removed). Exports `PluginSlot`, `routeManager`, `pluginManager` as no-ops to keep existing pages compiling.
- **`pages/admin/AdminPlugins.tsx`** — Inlined marketplace stub (old marketplace removed).

### Key Patterns (current, pre-migration)

- **Package manager**: pnpm with strict isolated `node_modules` (no `shamefully-hoist`). Dependencies must be declared in the package that imports them — phantom deps will cause build failures by design.
- **Internal deps**: use `workspace:*` protocol for all `@panel1/*` cross-package dependencies.
- **tRPC type sharing**: Web imports `AppRouter` type directly from `apps/api/src/routers/index.ts`. This will be replaced by orval-generated types from OpenAPI.
- **Auth**: JWT in localStorage, Bearer token header. `createContext()` in `trpc/context.ts` validates sessions; modular Hono routes use the same session table via `hono/security.ts`.
- **Permissions**: `requirePermission()` tRPC middleware + `withPermission()` HOC on frontend; Hono modules use seed-aligned ids via `ctx.requirePermission` (see `modules/*/seed-permissions.ts`, issue 1.2 for canonical names).
- **Jobs**: BullMQ queues backed by Redis.
- **Styling**: Tailwind CSS 3.
- **Testing**: Vitest (all packages). Use `vitest run` (never watch mode in scripts).
- **CI**: GitHub Actions with affected-only filtering (`turbo run ... --filter=...[origin/base]`). Runs build, type-check, test, and lint on changed packages only.

### What's Coming (per ARCHITECTURE.md)

- `packages/core/` — Module loader, event bus, filter chain, service registry, job scheduler (~500-800 LOC)
- `packages/types/` — Shared interfaces (IPaymentGateway, IProvisioner, IRegistrar), event type map
- `modules/` — Vertical-slice first-party modules (catalog, billing, subscriptions, payments, provisioning, support, etc.)
- Hono + Zod OpenAPI replacing Express + tRPC
- orval-generated React Query hooks replacing tRPC client
- Dynamic route/nav building from module `ui:` declarations

### Environment

Copy `apps/api/.env.example` to `apps/api/.env`. Key variables: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `REDIS_HOST`, `REDIS_PORT`, `API_PORT`.

### Conventions

- ESM throughout (`"type": "module"`)
- TypeScript target ES2020, module resolution `bundler`
- `strict: false` in root tsconfig (technical debt)
- Path aliases: `@/*` → `./src/*` (per package)
- Node >= 18 required
- pnpm only (enforced via `preinstall` guard); never use npm or yarn
- Version bumps via Changesets only — never edit `package.json` version manually
