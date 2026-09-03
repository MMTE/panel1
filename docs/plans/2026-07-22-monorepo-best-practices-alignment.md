# Plan: Align panel1 with monorepo-skill best practices

Five workstreams, executed in dependency order. Each is independently valuable; together they bring the repo in line with what the skill prescribes.

---

## Workstream 1 — Migrate npm → pnpm

**Why:** The skill's #1 recommendation. pnpm's strict `node_modules` catches phantom dependencies (high risk during the modular transition), uses a content-addressed store, and `workspace:*` makes internal links explicit. This is the cleanest moment — no `node_modules` is installed.

**Changes:**
1. **Create `/Users/Mahdi/Projects/panel1/pnpm-workspace.yaml`** — declare workspaces `apps/*`, `packages/*`, `modules/*` (drop dead `plugins/*` glob).
2. **Create `/Users/Mahdi/Projects/panel1/.npmrc`** — `auto-install-peers=true`, `strict-peer-dependencies=true`, `node-linker=isolated` (strict; will surface phantom deps to fix rather than hide). *Not* `shamefully-hoist=true` — we want to find the bugs.
3. **Update root `package.json`:**
   - `"packageManager": "npm@10.0.0"` → `"pnpm@9.x.x"` (match installed version)
   - Remove `"npm": ">=8.0.0"` from engines, keep `"node": ">=18.0.0"`
   - Add `preinstall` script guarding against npm/yarn (`only-allow pnpm`)
4. **Convert internal deps to `workspace:*`** in 3 package.json files (5 occurrences):
   - `packages/core` → `"@panel1/types": "workspace:*"`
   - `modules/audit` → `"@panel1/types": "workspace:*"`, `"@panel1/core": "workspace:*"`
   - `apps/api` → `"@panel1/core"`, `"@panel1/mod-audit"`, `"@panel1/types"` all → `"workspace:*"`
5. **Delete `package-lock.json`** (386K, npm v3 lockfile) — will be replaced by `pnpm-lock.yaml` after `pnpm install`.
6. **Run `corepack enable && corepack prepare pnpm@stable --activate`** then **`pnpm install`** to generate `pnpm-lock.yaml` and surface phantom-dependency errors.
7. **Fix phantom deps** surfaced by pnpm's strict mode (declare missing deps in the package that imports them). Scope depends on what install surfaces.

**Verification:** `pnpm install` succeeds clean, `pnpm -r build` type-checks all packages.

---

## Workstream 2 — Fix test runners (required for CI to pass)

**Why:** `apps/api` declares `"test": "jest"` but only `vitest` is installed (no jest, no jest config). `apps/web` runs `vitest` in watch mode (never terminates in CI). Both will fail CI.

**Changes:**
1. **`apps/api/package.json`**: `"test": "jest"` → `"test": "vitest run"`.
2. **`apps/web/package.json`**: `"test": "vitest"` → `"test": "vitest run"`.
3. **Migrate the 2 Jest test files to Vitest** (they use `@jest/globals` + `jest.mock`/`jest.fn`):
   - `apps/api/src/lib/catalog/__tests__/ComponentDefinitionService.test.ts` — replace `import { ..., jest } from '@jest/globals'` with `import { describe, it, expect, beforeEach, vi } from 'vitest'`; `jest.mock(...)` → `vi.mock(...)`; `jest.Mocked<T>` → `vi.Mocked<T>`; `jest.fn()` → `vi.fn()`.
   - `apps/api/src/lib/components/__tests__/ComponentLifecycleService.test.ts` — same transformations; `jest.mock` → `vi.mock`, `jest.fn()` → `vi.fn()`.
4. **Add `apps/api/vitest.config.ts`** — minimal config (path aliases for `@/*` → `./src/*`, `@types/*` → `./src/types/*` to match the api tsconfig).
5. **Add `jest`, `@types/jest`, `@jest/globals`** to root `devDependencies`? No — **remove** them if present, since nothing will use jest after migration. Check and clean root `"types": ["node", "jest"]` in root tsconfig → change to `["node"]`.

**Verification:** `pnpm --filter @panel1/api test` and `pnpm --filter @panel1/web test` both pass and terminate.

---

## Workstream 3 — Fix the orphan `@panel1/plugin-sdk` import + dependency reconciliation

**Why:** `NotificationPlugin.ts` imports from `@panel1/plugin-sdk`, which was deleted in the dev branch cleanup. This breaks under pnpm's strict resolution and any clean install. Also reconcile divergent versions that destabilize the lockfile hash.

**Changes:**
1. **Delete `apps/api/src/lib/plugins/examples/NotificationPlugin.ts`** — it references a deleted package, deleted types (`Panel1EventMap`), and a deleted plugin SDK contract. It's dead code from the old plugin system that was removed in the Phase 1 cleanup. *(Before deleting I'll confirm nothing imports it — the research shows it's standalone.)*
2. **Reconcile divergent dependency versions** (align to the newer version):
   | Dependency | Root | modules/audit | Action |
   |---|---|---|---|
   | `@hono/zod-openapi` | — | `^0.18.4` | → `^1.2.2` (match apps/api) |
   | `hono` | — | `^4.7.5` | → `^4.12.8` (match apps/api) |
   | `drizzle-orm` | `^0.28.6` | `^0.29.3` | root → `^0.29.3` |
   | `drizzle-kit` | `^0.19.13` | — | api `^0.20.13`; normalize root to `^0.20.13` |
3. **Clean stale `.gitignore` entry**: remove `apps/api/prisma/migrations/` (line 95) — project uses Drizzle, not Prisma; no prisma dir exists.
4. **Remove dead `plugins/*` from root `workspaces`** (already handled by pnpm-workspace.yaml not including it, but also clean the npm workspaces array for consistency if any npm fallback remains).

**Verification:** `pnpm install` resolves without peer warnings; `pnpm -r build` succeeds.

---

## Workstream 4 — Turbo caching tuning

**Why:** `turbo.json` has zero `inputs`, zero `env`, zero `globalDependencies`. Caching is coarse (hashes entire workspace) and env-var changes don't bust the cache. The skill flags this as a top cause of stale cache hits.

**Changes — rewrite `turbo.json`:**
```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local", "tsconfig.json", "tsconfig.base.json"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "inputs": ["src/**", "tsconfig.json", "tsconfig*.json", "package.json", "vite.config.ts", "drizzle.config.ts"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**", "tsconfig.json", "vitest.config.ts", "package.json"]
    },
    "lint": {
      "outputs": [],
      "inputs": ["src/**", "eslint.config.js", "package.json"]
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": [],
      "inputs": ["src/**", "tsconfig.json", "tsconfig*.json", "package.json"]
    },
    "dev": { "cache": false, "persistent": true },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false },
    "db:studio": { "cache": false }
  }
}
```
Key improvements:
- **`inputs`** on every cacheable task → precise cache keys, no over-broad hashing.
- **`globalEnv: ["NODE_ENV"]`** → env changes bust cache.
- **`globalDependencies`** → root config changes bust all caches.
- Removed stale `.next/**` and `build/**` from outputs (no Next.js in this project).
- Added **`type-check`** task (the skill's CI template references it).
- **`test` now `dependsOn: ["^build"]`** — don't test a package whose deps haven't built.

**Changes — add `type-check` script** to packages that lack it:
- `apps/api`: `"type-check": "tsc --noEmit"`
- `apps/web`: `"type-check": "tsc --noEmit"`
- `packages/core`, `packages/types`, `modules/audit`: their `build` is already `tsc --noEmit`, so add `"type-check": "tsc --noEmit"` aliasing build for turbo task discovery.

**Verification:** `turbo run build --dry=summarize` shows precise input sets; `turbo run build` twice → second run is cache hit.

---

## Workstream 5 — CI workflow + Changesets

**Why:** No `.github/workflows/` exists at all. No versioning tooling. The skill calls affected-only CI non-negotiable and Changesets the only correct way to version.

**Changes:**
1. **Create `.github/workflows/ci.yml`** — adapted from the skill's template, using pnpm:
   - Triggers: push to `main` + `dev`, all PRs.
   - `fetch-depth: 0` (required for affected detection).
   - Setup pnpm v9 via `pnpm/action-setup@v3`, Node 20 with `cache: pnpm`.
   - `pnpm install --frozen-lockfile`.
   - Local turbo cache via `actions/cache@v4` (keyed on SHA + OS).
   - Affected-only: `turbo run build type-check test lint --filter=...[origin/${{ github.event.pull_request.base.ref || github.ref_name }}]`.
   - (Remote cache env vars wired but optional — no-op if secrets absent.)
2. **Create `.github/workflows/release.yml`** — Changesets release (from skill template), adapted to pnpm. Triggers on push to `main` only. Uses `changesets/action@v1`.
3. **Changesets setup:**
   - `pnpm add -Dw @changesets/cli` then `pnpm changeset init`.
   - Configure `.changeset/config.json`: `changelog: "@changesets/cli/changelog"`, `access: "restricted"` (private packages), base version `0.1.0`.
   - Add `"changeset"` script to root: `"changeset": "changeset"`.
4. **Update root `package.json` scripts** for pnpm consistency: add `"type-check": "turbo run type-check"`.
5. **Update `AGENTS.md`** build commands section: `npm run` → `pnpm`, add `pnpm --filter` examples, note `workspace:*` convention, document the new CI/type-check/changeset commands.

**Verification:** Workflow YAML is valid (checked via `actionlint` if available, else manual review); `pnpm changeset` creates a changeset file correctly.

---

## Execution order & risk

1. **WS3 first** (delete orphan, reconcile deps) — cleans the slate so install works.
2. **WS1** (pnpm migration) — `pnpm install` generates the new lockfile on the clean state.
3. **WS2** (test fixes) — unblocked once install works.
4. **WS4** (turbo tuning) — builds on the working install + tests.
5. **WS5** (CI + changesets) — final layer, references all of the above.

**Risk areas I'll watch:**
- pnpm strict mode will surface phantom deps — I'll fix them as they appear rather than falling back to `shamefully-hoist`.
- The `apps/api` Jest→Vitest migration touches test assertion syntax — I'll run the tests after converting to confirm they pass.
- I will **not** force a commit/push; changes stay local for your review.

**Not in scope** (flagging for later): reconciling the two divergent `.env.example` files (root vs apps/api), fixing the empty `CODE_OF_CONDUCT.md`, fixing `CONTRIBUTING.md` Prisma references, the missing `docker/postgres/init` bind-mount dir, and migrating tsconfig to a shared `packages/tsconfig` package (the skill's ideal pattern — but that's a larger refactor better done separately).