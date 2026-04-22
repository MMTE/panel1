# AGENTS.md

## Build & Development Commands

```bash
# Start all services (API + Web) in parallel
npm run dev

# Start individual services
npm run dev:api          # API only (tsx watch, port 3001)
npm run dev:web          # Web only (Vite, port 5173)

# Build
npm run build            # All workspaces via turbo

# Lint
npm run lint             # All workspaces via turbo

# Test
npm run test             # All workspaces via turbo
cd apps/api && npm run test:hono       # Vitest: Hono security + integration (audit/support when DB + tables exist)
cd apps/api && npm run test:integration # Vitest: only `src/__tests__/integration` (same conditions)
cd apps/api && npx vitest run          # API tests only (if configured)
cd apps/web && npx vitest run          # Web tests only
cd apps/api && npx vitest run src/path/to/file.test.ts  # Single test

# Database (Drizzle ORM + PostgreSQL)
npm run db:generate      # Generate migration from schema changes
npm run db:migrate       # Push schema to database
npm run db:studio        # Open Drizzle Studio GUI
cd apps/api && npx tsx src/db/seed.ts  # Seed database

# Infrastructure (required before dev)
docker compose up -d     # PostgreSQL (5432), Redis (6379), MailHog (SMTP 1025, UI 8025)
```

## Architecture

**Target architecture** is defined in [ARCHITECTURE.md](./ARCHITECTURE.md). The codebase is in transition from the old monolithic layout to a modular monolith with vertical-slice modules.

### Current State (in transition)

**Monorepo** using npm workspaces + Turborepo. Two apps remain; packages and modules directories are being rebuilt.

| Workspace | Package Name | Purpose |
|-----------|-------------|---------|
| `apps/api` | `@panel1/api` | Express + tRPC backend (port 3001) — will become thin Hono shell |
| `apps/web` | `@panel1/web` | React + Vite frontend (port 5173) — will become dynamic module-based shell |

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

- **tRPC type sharing**: Web imports `AppRouter` type directly from `apps/api/src/routers/index.ts`. This will be replaced by orval-generated types from OpenAPI.
- **Auth**: JWT in localStorage, Bearer token header. `createContext()` in `trpc/context.ts` validates sessions; modular Hono routes use the same session table via `hono/security.ts`.
- **Permissions**: `requirePermission()` tRPC middleware + `withPermission()` HOC on frontend; Hono modules use seed-aligned ids via `ctx.requirePermission` (see `modules/*/seed-permissions.ts`, issue 1.2 for canonical names).
- **Jobs**: BullMQ queues backed by Redis.
- **Styling**: Tailwind CSS 3.

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
- Path aliases: `@/*` → `./src/*`, `@panel1/*` → `./packages/*/src`
- Node >= 18 required
