# Panel1 Implementation Plan — Verified Money-Core Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Milestone M1 decomposes into per-module sub-plans (see §11).

**Goal:** Ship one trustworthy end-to-end money path (signup → pay → provision → renew → refund) whose books reconcile to Stripe's balance report to the cent, then make the WHMCS importer the wedge into a market that is leaving WHMCS but cannot find an alternative it trusts.

**Architecture:** Vertical-slice modules on `@panel1/core` (Hono REST, services as the public API, one event bus backed by a transactional Postgres outbox, BullMQ only for scheduled/retryable jobs with unique keys). Integer-minor-units money with a double-entry ledger as the single source of financial truth. Single-tenant-first. Stripe-only. cPanel-only. Everything that is not on the verified money path is frozen.

**Tech Stack:** TypeScript (strict), Node 20+, Hono, Drizzle ORM (Postgres), Postgres 16, BullMQ (Redis), Stripe SDK, cPanel/WHM API (2087/2083), Zod, Vitest + pglite (DB tests without a live Postgres).

---

## 0. How to read this plan / what changed since the due-diligence report

The 2026-07-12 due-diligence report described a legacy `apps/api/src/lib` billing core that was non-functional. A second "half-stale" analysis observed that the team had since started D1 (built `modules/{billing,payments,subscriptions,provisioning,catalog,support}`, fixed audit auth, killed the dual-worker queue, made the core scheduler execute, added an outbox table, moved encryption into core).

This plan is built on a **fresh read-only verification of the actual `dev` branch** (7 parallel verification agents, 124 tool calls, every claim checked against the cited file). It supersedes both prior documents where they conflict. The headline changes from what those documents asserted:

- **R1 (audit auth): genuinely FIXED.** All 10 audit routes require auth; tenant comes from the session, never from request inputs. Confirmed in `modules/audit/src/routes.ts`.
- **R3 (double-charge): STILL LIVE, in a new place.** `apps/api/src/lib/core/legacyBridge.ts:31-38` registers a `0 1 * * *` legacy renewal sweep; `modules/subscriptions/src/index.ts:73` registers a `0 2 * * *` modular sweep. Both hit the same due-subscription set. One hour apart.
- **R2 (webhook): STILL FULLY BROKEN, differently.** Route now exists, but global Bearer+tenant middleware blocks Stripe at the door, the Stripe signature is never verified (`constructEvent` has zero hits repo-wide), `externalId` stores the `client_secret` while the webhook looks up by `pi_…` → zero-row match, and there is no event-dedup table.
- **R5 (encryption): MOVED, NOT FIXED.** `packages/core/src/encryption.ts:58-59` generates a random IV then calls deprecated `crypto.createCipher` *without the IV* — the exact defect, ported.
- **D2 (money/ledger): STILL UNDECIDED.** Floats throughout (`Math.round(amount*100)`, `parseFloat`); no ledger table exists; refunds are overwritable aggregate fields and a failed refund still marks the payment `REFUNDED`.

And three findings **neither prior document caught** (all from this verification):

1. **CRITICAL — cross-tenant money race.** `modules/payments/src/service.ts:121-174`: one shared `Stripe` instance per gateway name is mutated in place with each tenant's secret (`gw.initialize(decrypted)` overwrites `this.stripe`). Two concurrent `createCharge` calls for different tenants race — tenant A's charge can be issued against tenant B's Stripe key.
2. **Zero-value renewal invoices.** `modules/billing/src/service.ts:421-435`: `createRecurringInvoice` inserts `subtotal='0', tax='0', total='0'` with no line items. Every renewal produces a €0 invoice regardless of plan price.
3. **Non-transactional outbox + no relay.** `apps/api/src/lib/core/eventOutbox.ts:11-21` inserts the row outside any domain transaction; nothing ever re-scans stranded `pending` rows. It is delivery-tracking masquerading as a transactional outbox. A crash mid-emit loses or strands the event.

**Verdict, restated for the record:** the rebuild-on-modules call (report D1b) was correct and is underway. The work that remains is *not* "execute the report's plan" — it is (P0) un-break the tree, (P1) fix the correctness defects carried into the new modules, (P2) close the small security items — sequenced behind the D2 money/ledger design — and then assemble the M1 reconciliation demo. The market analysis (§1) says that demo and the importer *are* the product.

---

## 1. Strategic frame (from the market analysis — the "why")

- **The market window is real and widening.** WHMCS/WebPros raised prices again in Jan 2026; users stay only because WHMCS is "stable and has a proven track record." The niche is not short on alternatives; it is short on ones people trust with revenue.
- **You are entering third.** Paymenter (Laravel, OSS) ships a working WHMCS importer, a marketplace, 27k+ community, and a $5/mo hosted tier. FOSSBilling is at 0.7-beta with cPanel/Plesk/DirectAdmin provisioning. The #1 documented failure mode in this market is *migration fails → provider returns to WHMCS*.
- **Therefore correctness is the only viable differentiator.** Neither competitor has a double-entry ledger, cent-exact gateway reconciliation, or tested idempotent renewals. Nobody in this niche does. "The billing panel whose books reconcile to Stripe to the cent, with the test suite to prove it" is a real, defensible position — and it is exactly what P0/P1/D2 produce. One double-charge at launch and the project is dead on LowEndTalk; trust is unrecoverable there.
- **The importer is the wedge, not a feature.** It stays sequenced *after* the money core (importing into a biller that double-charges is negative progress), but it is in the launch definition, not the backlog.
- **The build pattern is the biggest risk, not the architecture.** The codebase shows breadth-first generation (marketplace, analytics, multi-gateway routing, dunning variants) on a core that could not take one payment. The architecture is fine; the *process* must invert to: demo-first milestones, CI as a hard gate, human review on every money-path PR, a written freeze list.

**Product, one sentence:** *"Single-tenant, self-hosted billing for hosting providers: Stripe + cPanel, imports your WHMCS data, and never loses a cent."*

---

## 2. Verified current-state truth table (the evidence base)

Generated 2026-07-12 by read-only verification of the `dev` branch. Severity in brackets. Every row cites a file actually read.

### Done since the report
| Item | Status | Evidence |
|---|---|---|
| New modules built | ✅ | `modules/{billing,payments,subscriptions,provisioning,catalog,support}`; `provisioning`+`subscriptions` untracked (new) |
| R1 audit auth | ✅ FIXED | `modules/audit/src/routes.ts` — all 10 routes via `routePerm`; tenant from session (`c.get('tenantId')`), never from request |
| Core JobScheduler executes | ✅ | `packages/core/src/jobs.ts:108-136` (BullMQ repeatable) + `:165-187` (node-cron in-process) |
| Dual-worker `events` queue | ✅ killed as duplicate | only `ComponentLifecycleService` consumes `'events'`; core bus is `'panel1-core-events'` — **but see new issue: silent two-bus split** |
| Outbox table exists | ⚠️ added but not transactional | `0004_event_outbox.sql`; `eventOutbox.ts:11-21` inserts outside any tx; **no relay exists** |
| Real migration files | ✅ exist | `apps/api/src/db/migrations/0000..0004_*.sql` (but `0003` is a 1-byte empty file) |

### Still broken / carried into new modules
| ID | Finding | Severity | Evidence |
|---|---|---|---|
| **P0** | API does not build/boot | CRITICAL | `apps/api/src/index.ts:9,14,19,26,27` imports 4 deleted modules; 5 routers import deleted services; `legacyBridge.ts` imports deleted `Logger`/`PaymentEventHandler` → cannot load |
| **P0b** | False-green build | HIGH | lax `tsc` (`noImplicitAny:false`) types unresolved imports as `any`; `npm run build` exits 0 on a dead app |
| **P0c** | Lockfile out of sync | HIGH | `npm ci` fails (missing `is-weakmap`, `is-callable`, …); no `node_modules` |
| **R3′** | Two renewal sweeps live | CRITICAL | `legacyBridge.ts:31-38` (`0 1 * * *`) + `modules/subscriptions/src/index.ts:73` (`0 2 * * *`) over the same due set |
| **R2a** | Webhook blocked by auth | CRITICAL | `index.ts:142-143` global Bearer+tenant; no webhook exemption (`security.ts:48-51` exempts only `/api/catalog/public`) |
| **R2b** | No Stripe signature verification | CRITICAL | `modules/payments/src/service.ts:92-103` casts `payload as any`; `signature` ignored; `constructEvent` → 0 hits |
| **R2c** | externalId mismatch → zero-row updates | HIGH | stores `intent.client_secret` (`service.ts:62`) vs lookup by `pi.id` (`:96,605-609`) → "No payment found", status never reaches COMPLETED |
| **R2d** | No event dedup | HIGH | `modules/payments/src/schema.ts` has only `payments`, `paymentAttempts`, `paymentGatewayConfigs` |
| **R2e** | Webhook returns 200 on failure | HIGH | `routes.ts:402` `return c.json(result, 200)` regardless of `processed` |
| **NEW-A** | Cross-tenant Stripe race | CRITICAL | shared singleton mutated per request (`service.ts:121-124,151-174,206,230`) |
| **NEW-B** | Zero-value renewal invoices | HIGH | `billing/service.ts:421-435` inserts `subtotal/tax/total = '0'`, no items |
| **R4/D2** | Floats; no ledger | HIGH | `billing/service.ts:33-36`, `payments/service.ts:49,71,82,88`; zero ledger/journal tables repo-wide |
| **R4′** | Refunds overwrite + failed-refund marks REFUNDED | HIGH | `payments/schema.ts:48-50` scalar fields; `service.ts:372-381` overwrites; status from `amount` not gateway outcome |
| **SM1** | markPaid unconditional | HIGH | `billing/service.ts:184-209` — no amount check, no state guard; CANCELLED → PAID possible |
| **SM2** | Generic update accepts `status:'PAID'` | HIGH | `billing/routes.ts:126-147` + `service.ts:133-165` writes `data.status` directly |
| **SM3** | Invoice numbering race | MEDIUM | `billing/service.ts:464-497` read-modify-write in tx, no atomic `+1 RETURNING` / `FOR UPDATE` (guarded only by `unique(tenantId,year)`) |
| **RE1** | Period advances before payment | HIGH | `subscriptions/service.ts:206-224` emits + advances with no charge in the method |
| **RE2** | No per-(sub,period) idempotency | HIGH | `subscriptions/schema.ts:36-42` no unique key; `service.ts:196-226` non-atomic read-check-update |
| **RE3** | Duplicate invoices on retry | HIGH | `billing/index.ts:54-56` creates invoice per `subscription.renewed`; no `unique(subscriptionId,period)` |
| **TN1** | Renewal UPDATE missing tenant predicate | MEDIUM | `subscriptions/service.ts:215-224` `.where(eq(id))` only |
| **TN2** | Dunning global + triggerable by any tenant admin | HIGH | `billing/service.ts:299-342` no tenant filter; `routes.ts:429-437` `POST /dunning/run` needs only `billing.dunning.manage` |
| **TN3** | invoicesViewOwn not resource-scoped | HIGH | `billing/routes.ts:299-309` + `service.ts:71-86`; `requirePermission` is pure OR, no ownership check |
| **R5′** | Encryption still broken (ported) | CRITICAL | `packages/core/src/encryption.ts:58-59` `createCipher` w/o IV; deprecated; throws on modern Node |
| **R5b** | Encryption silently optional | HIGH | call sites fall back to plaintext when `ctx.encryption` absent (`provisioning/service.ts:477-482`, `payments/service.ts:471-476`) |
| **R5c** | webhookSecret plaintext, masked as `[encrypted]` | HIGH | `payments/schema.ts:94` plain varchar; `service.ts:782-783` mislabels |
| **D7′** | cPanel stub returns fake success | CRITICAL | `provisioning/adapters/CpanelAdapter.ts:18-77` all mutations `{success:true,…}` no WHM call |
| **D7b** | Provisioning fire-and-forget; jobId/maxAttempts dead | HIGH | `provisioning/service.ts:300-305` unawaited in-process; `schema.ts:86,89` columns never written |
| **D7c** | No compensation for paid-but-unprovisioned | MEDIUM | no `paid_unprovisioned`; `provisioning.failed` only logged (`index.ts:43-67`) |
| **NEW-C** | Provisioning adapter cache ignores tenant | HIGH | `provisioning/service.ts:405-437` keyed by `providerId` only; cross-tenant credential leak |
| **NEW-D** | Two-bus event split | MEDIUM | `ComponentLifecycleService` on `'events'` ≠ core `'panel1-core-events'`; lifecycle events on core bus never reach it |
| **P2a** | JWT secret hardcoded fallback | CRITICAL | `apps/api/src/lib/auth.ts:9` `\|\| 'your-super-secret-jwt-key'` |
| **P2b** | No auth rate limiting | HIGH | zero rate-limit middleware; login is unthrottled `publicProcedure` |
| **P2c** | CSP unsafe-inline/eval; CORS hardcoded localhost in prod | HIGH | `index.ts:41-49,52-83` |
| **P2d** | `db:migrate` = destructive `push:pg` | HIGH | `apps/api/package.json:16`; bypasses the real `.sql` files |

---

## 3. Decisions (updated D1–D8, plus the pivotal one)

**D1 — Foundation: rebuild on modules.** ✅ Affirmed (underway). Quarry legacy; do not repair it.

**D2 — Money & ledger: integer minor units + double-entry ledger.** ✅ Decide now, before any more billing code. This is the expensive-to-reverse one; module schemas are days old with no production data — this is the cheapest it will ever be. Design in §5/Phase C.

**D3 — One event architecture: transactional Postgres outbox + core EventBus; BullMQ only for jobs with unique keys.** ✅ The current outbox is *not* transactional and has no relay — both must be fixed (Phase H). Kill the orphan `events` queue / two-bus split.

**D4 — Tenancy: single-tenant-first.** ✅ Keep the `tenant_id` column; hardcode one tenant for v1; delete the tenant-switching UI surface; defer RLS. **Branch:** if the business model (D9) is hosted SaaS, keep the column and later add per-tenant unique keys + RLS — the column earns its keep either way, so this decision is reversible.

**D5 — Type discipline & CI gate.** ✅ `strict: true` on `packages/*`, `modules/*`, and `apps/api`; delete `src/types/overrides.ts`; turn on `noImplicitAny` (it is the *one* setting whose absence hides dead imports — P0b). Legacy `lib/*` is deleted, not fixed. CI red = no merge.

**D6 — Payment scope: Stripe-only, webhook-first, idempotent.** ✅ Keep the gateway *interface*; delete "best gateway" selection. Refunds route by stored originating-gateway reference, never re-selection. One gateway until the contract survives a second gateway written out-of-tree.

**D7 — Freeze/delete list.** ✅ See §9.

**D8 — Security triage this week.** ✅ See Phase B.

**D9 — Business model (THE pivotal open decision).** This is the one decision the reports could not make and it gates D4's depth. Recommendation: **single-tenant, self-hosted first, monetize via support + paid modules** (matches the WHMCS-replacement buyer and keeps the codebase honest). Alternative: hosted SaaS (then multi-tenancy eventually matters and RLS investment is justified later). *This plan is written to be decision-resilient:* the only thing that changes is whether §Phase-F deletes the tenant-switching UI now (single-tenant) or instead invests in per-tenant unique constraints (SaaS). Recommend deciding before Phase F.

---

## 4. Process discipline (the actual risk)

These are rules, not tasks. They apply to every subsequent phase.

1. **Demo-first milestones.** A milestone is done when its demo passes, not when its features are built. M1's demo is in §6/Phase J.
2. **CI is a hard gate.** `strict` tsc + full test suite green, no live Postgres required (pglite). Red = no merge. No `push:pg`. (Phase I.)
3. **Human review on every money-path PR.** Ledger, payments, invoicing, renewals, webhook, refunds. No exceptions, no auto-merge.
4. **Stubs fail loudly.** Nothing returns fake success. A not-yet-implemented path throws `NotImplementedError` and surfaces in the demo. (Phase G.)
5. **No new breadth.** No PRs into frozen areas (§9). New modules require a written spec + plan first.
6. **One money convention.** All money is integer minor units (`amount_minor bigint` + `currency char(3)`). No `parseFloat`/`*100` on money anywhere after Phase C. Enforced by a lint rule / grep gate in CI.
7. **Every state change that matters posts to the ledger in the same transaction as the event emission.** (Phase H.)

---

## 5. Global constraints (apply to every task)

- **Money:** stored as `bigint` minor units (e.g. €9.99 = `999`) with an explicit `currency char(3)` ISO-4217 column; conversions to/from decimal happen only at boundaries (Stripe API, display) via a single `money.ts` helper using `Math.round` on the currency's exponent. JPY/KRW zero-decimal currencies handled by exponent table, never `*100`.
- **Tenancy:** every read/write that touches tenant-scoped data includes a `tenantId` predicate. `tenantId` always comes from the authenticated session, never from request inputs.
- **Idempotency:** every external trigger (webhook event, renewal period, retry) has a dedup key enforced by a DB unique constraint.
- **Migrations:** schema changes land as versioned Drizzle `.sql` migrations applied via `drizzle-kit migrate`. `push:pg` is removed.
- **Strict TS:** `strict: true`, `noImplicitAny: true`. No `any` in money/ledger/payments code.
- **Tests:** DB-backed tests use pglite (no live Postgres). Money-path tests must pass in CI.
- **No fake success:** unimplemented provisioning/gateway paths throw `NotImplementedError`.

---

## 6. Milestones (demos, not feature lists)

- **M1 — internal alpha (~6 weeks, this plan's Phase A→J).** One tenant: signup → Stripe test payment → provision (real WHM sandbox, or `NotImplementedError`) → renew → refund. Books reconcile to Stripe's balance report to the cent. Test suite includes the double-fire/duplicate cases from §2. Nothing else ships until this exists.
- **M2 — private beta (+6–8 weeks).** WHMCS importer (clients, services, invoices) + 3–5 design partners running it in shadow mode next to their live WHMCS. Recruit from LowEndTalk / WHMCS pricing-rage threads now.
- **M3 — public launch.** Docs matching reality; one out-of-tree module proving the extension contract; security baseline. Announcement leads with the reconciliation guarantee and the importer.

---

## 7. Phase A — P0: un-break the tree (this week, prerequisite to everything)

**Goal:** the API builds with strict TS and boots against `docker-compose`. No R3 double-charge vector while the legacy code still exists.

**Files:**
- Delete: `apps/api/src/routers/{invoices,payment-gateways,subscriptions,provisioning,health}.ts` (replaced by module routes)
- Delete: `apps/api/src/lib/core/legacyBridge.ts` (kills the 01:00 renewal sweep + imports deleted modules), `apps/api/src/lib/jobs/JobProcessor.ts`, `apps/api/src/lib/components/ComponentLifecycleService.ts`, `apps/api/src/lib/core/OperationalQueues.ts` (30-min re-enqueue + daily sweep), and the stragglers that import deleted services: `apps/api/src/lib/core/catalogRuntime.ts`, `apps/api/src/lib/plugins/{domain,provisioning,ssl}/*`, `apps/api/src/lib/{domains,ssl}/*`
- Rewrite: `apps/api/src/index.ts` (remove deleted imports; swap to core logger + core `EncryptionService`; drop the `new CpanelPlugin()` wiring at L198-199)
- Modify: `apps/api/tsconfig.json` (`strict:true`, `noImplicitAny:true`); `apps/api/package.json` (drop `bull`, keep `bullmq`; remove `redis` OR `ioredis` — keep one)

**Interfaces:**
- Produces: a booting API that mounts only module routes + auth + the Express→Hono bridge. No legacy routers.

- [ ] **A1: Confirm the deletion set compiles away.** Run `grep -rn "from '\.\./lib/\(invoice\|payments\|subscription\|provisioning\|security/Encryption\|logging/Logger\|email\|resilience\|errors\)'" apps/api/src` and list every importer; verify each is in the delete set or is `index.ts` (rewritten).

- [ ] **A2: Delete the legacy files.**
```bash
git rm apps/api/src/routers/invoices.ts \
       apps/api/src/routers/payment-gateways.ts \
       apps/api/src/routers/subscriptions.ts \
       apps/api/src/routers/provisioning.ts \
       apps/api/src/routers/health.ts \
       apps/api/src/lib/core/legacyBridge.ts \
       apps/api/src/lib/core/OperationalQueues.ts \
       apps/api/src/lib/core/catalogRuntime.ts \
       apps/api/src/lib/jobs/JobProcessor.ts \
       apps/api/src/lib/components/ComponentLifecycleService.ts
# plus the plugin/domain/ssl stragglers identified in A1
```

- [ ] **A3: Rewrite `apps/api/src/index.ts`.** Remove imports of `initializeEmailService`, `CpanelPlugin`, `logger` (→ core), `emailService`, `encryptionService` (→ core), `jobProcessor`, `ComponentLifecycleService`, `installLegacyBridgeBeforeJobSchedulerStart`. Keep: Express app, raw-body bridge (L165-170 — needed later for webhook signature), Hono mount loop (L145-147), auth + tenant middleware (L142-143). Replace logger with `import { logger } from '@panel1/core'`. Replace encryption with core's `EncryptionService` (after Phase G fixes it).

- [ ] **A4: Turn on strict TS for the API.**
```jsonc
// apps/api/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": { "strict": true, "noImplicitAny": true, "noEmit": false }
}
```
Delete `apps/api/src/types/overrides.ts`. Fix or delete-by-delete until `tsc` is green.

- [ ] **A5: Resync the lockfile.**
```bash
rm -rf node_modules apps/api/node_modules packages/*/node_modules modules/*/node_modules
npm install
npm ci --dry-run   # must succeed
```

- [ ] **A6: Boot test.**
```bash
docker compose up -d postgres redis
npm run db:migrate      # must be migrate, not push — see Phase I; interim: run drizzle-kit migrate
npm run dev --filter=@panel1/api &
curl -sf http://localhost:8000/healthz || (echo "boot failed"; exit 1)
```
Expected: 200 from healthz; no `ERR_MODULE_NOT_FOUND`.

- [ ] **A7: Verify R3 vector is gone.** `grep -rn "scheduleSubscriptionRenewals\|processScheduledJobs\|legacy-daily-subscription-renewals" apps/api/src modules/` → only the single modular sweep at `modules/subscriptions/src/index.ts:73` remains.

- [ ] **A8: Commit.**
```bash
git commit -m "fix(api): remove legacy lib/router dead code, enable strict TS, boot on module routes

- delete 5 legacy routers + legacyBridge/OperationalQueues/JobProcessor/ComponentLifecycleService
  (removes the second 01:00 renewal sweep — R3 double-charge vector)
- rewrite index.ts to mount only module routes; use core logger/encryption
- strict:true + noImplicitAny:true; delete types/overrides.ts
- resync package-lock.json"
```

---

## 8. Phase B — P2 security triage (this week, parallel to A; independent of D2)

**Goal:** close the fail-open / exploitable items. Each is small and blocks on no architectural decision.

### B1 — JWT fail-closed
**Files:** Modify `apps/api/src/lib/auth.ts:9`

- [ ] **B1.1: Failing test.**
```ts
// apps/api/src/lib/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
describe('JWT secret', () => {
  beforeEach(() => { delete process.env.JWT_SECRET; });
  it('throws when JWT_SECRET is unset (fail-closed)', () => {
    expect(() => import('./auth?env=test')).toThrow(/JWT_SECRET/);
  });
});
```
- [ ] **B1.2: Run → FAIL.** `npx vitest run apps/api/src/lib/auth.test.ts`
- [ ] **B1.3: Implement.**
```ts
// apps/api/src/lib/auth.ts:9
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and >= 32 chars (fail-closed)');
}
```
- [ ] **B1.4: Run → PASS. Commit.** `git commit -m "fix(auth): fail closed on missing/weak JWT_SECRET (R7)"`

### B2 — Auth rate limiting
**Files:** Modify `apps/api/src/routers/auth.ts`; add dep (e.g. `@upstash/ratelimit` + existing Redis, or in-memory `lru-cache` for single-tenant).

- [ ] **B2.1: Test** — 11th login attempt from one IP within 60s returns 429.
- [ ] **B2.2: Implement** — wrap `signIn`/`signUp` with a 10/min/IP token bucket keyed on `x-forwarded-for` (or socket). Return 429 with `Retry-After`.
- [ ] **B2.3: Run → PASS. Commit.**

### B3 — CSP / CORS
**Files:** Modify `apps/api/src/index.ts:41-83`

- [ ] **B3.1: Implement.**
```ts
// CSP: drop unsafe-eval; unsafe-inline only behind a nonce if needed
const csp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],                 // add nonce scheme if inline scripts needed
    styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: [process.env.API_ORIGIN ?? "'self'"],  // drop unconditional localhost:*
  },
});
// CORS: env-driven
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',').map(s => s.trim());
```
- [ ] **B3.2: Test** — prod config (`NODE_ENV=production`, `CORS_ORIGIN=https://panel.example.com`) rejects `Origin: http://evil.com` and accepts the configured origin.
- [ ] **B3.3: Commit.**

### B4 — Real migrations (also Phase I, done here for safety)
**Files:** Modify `apps/api/package.json:16`; fix `0003` empty file.

- [ ] **B4.1:** `"db:migrate": "drizzle-kit migrate"`. Remove `push:pg` everywhere.
- [ ] **B4.2:** Replace the 1-byte `0003_add_roles_permissions.sql` with the real DDL it was meant to carry (or delete it from the migration journal if truly empty — confirm against `meta/_journal.json`).
- [ ] **B4.3: Test** — `docker compose down -v && docker compose up -d postgres && npm run db:migrate` applies all migrations cleanly on an empty DB.
- [ ] **B4.4: Commit.**

---

## 9. Phase C — D2: money core (ledger + minor units + state machines)

**This is the gating design. No more billing-module code lands before Phase C merges.** It is cheapest now (no production data).

**Files:**
- Create: `packages/core/src/money.ts` (minor-units helpers), `modules/billing/src/ledger/schema.ts`, `modules/billing/src/ledger/service.ts`, `modules/billing/src/ledger/invariants.ts`
- Migration: `apps/api/src/db/migrations/0005_ledger.sql`
- Modify: `modules/billing/src/schema.ts` (add `amount_minor`/`currency` columns; keep `decimal` for display-compat during migration, then drop), `modules/payments/src/schema.ts` (same), all money arithmetic sites in `modules/billing/src/service.ts` and `modules/payments/src/service.ts`

### C1 — Money helpers
- [ ] **C1.1: Failing test.**
```ts
// packages/core/src/money.test.ts
import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, EXPONENT } from './money';
describe('money', () => {
  it('converts EUR/USD with 2 decimals', () => {
    expect(toMinor(9.99, 'EUR')).toBe(999n);
    expect(fromMinor(999n, 'EUR')).toBe('9.99');
  });
  it('handles zero-decimal currency JPY', () => {
    expect(toMinor(1000, 'JPY')).toBe(1000n);
    expect(fromMinor(1000n, 'JPY')).toBe('1000');
  });
  it('rounds half-to-even at the boundary', () => {
    expect(toMinor(0.125, 'USD')).toBe(13n); // 0.125 -> 12.5 -> 12 (banker's) or 13; pin the rule in code
  });
});
```
- [ ] **C1.2: Run → FAIL.**
- [ ] **C1.3: Implement** `packages/core/src/money.ts` — `EXPONENT` table (USD/EUR=2, JPY/KRW=0, BHD=3), `toMinor(decimal, ccy): bigint`, `fromMinor(minor, ccy): string`, `add`/`sub` on bigint. Document the rounding rule (round-half-to-even at the minor boundary).
- [ ] **C1.4: Run → PASS. Commit.**

### C2 — Ledger schema
- [ ] **C2.1: Migration `0005_ledger.sql`.**
```sql
-- Double-entry ledger. One source of financial truth.
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,                 -- e.g. 'accounts_receivable','stripe_clearing','sales_revenue','tax_payable','refunds'
  type text NOT NULL CHECK (type IN ('asset','liability','revenue','equity')),
  currency char(3) NOT NULL,
  UNIQUE (tenant_id, code, currency)
);
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  description text NOT NULL,
  source_type text NOT NULL,          -- 'invoice'|'payment'|'refund'|'adjustment'
  source_id uuid NOT NULL,
  period_start date,                  -- for recurring uniqueness
  posted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','voided')),
  UNIQUE (tenant_id, source_type, source_id, period_start)  -- idempotency: one tx per (invoice/payment/refund, period)
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
  account_id uuid NOT NULL REFERENCES ledger_accounts(id),
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries(tenant_id, account_id);
CREATE INDEX ledger_entries_tx_idx ON ledger_entries(transaction_id);
-- Balance invariant enforced at post time (see invariants.ts); optional guarding CHECK:
-- (per-transaction balance is asserted in the posting transaction, not a raw CHECK, since it is cross-row.)
-- Refund records (append-only; replaces refundedAmount aggregate)
CREATE TABLE IF NOT EXISTS refund_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  gateway_ref text,                  -- Stripe refund id (re_...)
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','succeeded','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refund_records_payment_idx ON refund_records(tenant_id, payment_id);
-- Webhook event dedup (R2d)
CREATE TABLE IF NOT EXISTS webhook_events (
  tenant_id uuid NOT NULL,
  gateway_name text NOT NULL,
  event_id text NOT NULL,            -- Stripe evt_...
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, gateway_name, event_id)
);
```
- [ ] **C2.2: Drizzle definitions** in `modules/billing/src/ledger/schema.ts` mirroring the above (so the TS layer is type-enforced).
- [ ] **C2.3: Test the migration applies** on pglite and on a clean docker Postgres.

### C3 — Ledger posting invariant (the reconciliation guarantee lives here)
- [ ] **C3.1: Failing test.**
```ts
// modules/billing/src/ledger/invariants.test.ts
describe('ledger invariants', () => {
  it('rejects an unbalanced transaction (debits != credits)', async () => {
    await expect(post({ tenantId, entries: [
      { account: 'accounts_receivable', direction: 'debit', amount: 999n },
      { account: 'sales_revenue', direction: 'credit', amount: 998n },
    ] })).rejects.toThrow(/unbalanced/i);
  });
  it('accepts a balanced transaction', async () => { /* ... sums equal ... */ });
  it('is idempotent on (source_type, source_id, period_start)', async () => {
    const a = await postInvoiceTx(inv, period); const b = await postInvoiceTx(inv, period);
    expect(b.id).toBe(a.id);          // same transaction, not a duplicate
  });
});
```
- [ ] **C3.2: Implement `post()`** inside a single `db.transaction`:
  1. `INSERT INTO ledger_transactions ... ON CONFLICT (tenant_id, source_type, source_id, period_start) DO NOTHING RETURNING id` — if conflict, return the existing id (idempotent).
  2. Assert `sum(debit) === sum(credit)` per currency; else throw `UnbalancedTransactionError` (rolls back).
  3. Insert entries.
  4. (Same transaction) write the domain state change + outbox row (Phase H).
- [ ] **C3.3: Run → PASS. Commit.**

### C4 — Posting rules (accounting logic)
Define, as code + tests, the journal entries for each event:
- **Invoice issued:** DR `accounts_receivable` (total), CR `sales_revenue` (subtotal), CR `tax_payable` (tax).
- **Payment succeeded:** DR `stripe_clearing` (amount), CR `accounts_receivable` (amount). Mark invoice PAID **only if** `payment.amount_minor >= invoice.total_minor` (state machine, replaces SM1/SM2).
- **Refund:** DR `refunds` (amount), CR `accounts_receivable` (amount); append a `refund_records` row with the Stripe `re_…` ref (replaces R4′ overwrite). Payment status derived from `sum(refund_records.amount_minor where status='succeeded')`, never from a single gateway call's `amount` arg.
- **Reconciliation target:** `ledger_entries.amount_minor` for `stripe_clearing` (debits − credits) === Stripe's net balance for that account, to the cent. This is the M1 acceptance test (Phase J).

- [ ] **C4.1–C4.4:** one TDD cycle (test → fail → impl → pass → commit) per posting rule.

### C5 — Kill the float paths
- [ ] **C5.1:** Replace every `parseFloat(amount)`, `Math.round(amount*100)`, `intent.amount/100` in `modules/billing/src/service.ts` and `modules/payments/src/service.ts` with `toMinor`/`fromMinor` + bigint math. Add an ESLint rule / CI grep: `grep -rnE "parseFloat|\\* *100|/ *100" modules/billing modules/payments` must return zero money-context hits.
- [ ] **C5.2: Fix NEW-B** — `createRecurringInvoice` must read the plan price and build real line items (subtotal/tax/total from the catalog price), not zeros.
- [ ] **C5.3: Fix SM2** — remove `status` from the generic `PUT /invoices/:id` update input; PAID is reachable only via settlement.
- [ ] **C5.4: Fix SM3** — invoice numbering: `UPDATE invoice_counters SET last_number = last_number + 1 WHERE tenant_id=? AND year=? RETURNING last_number` (atomic). Keep the `unique(tenant_id,year)` guard.
- [ ] **C5.5: Commit.**

---

## 10. Phase D — Webhook pipeline (R2, rebuild)

**Goal:** Stripe events arrive, are signature-verified over the raw body, deduped, and reconcile a payment by `pi_…` id. End-to-end the payment reaches COMPLETED.

**Files:** Modify `modules/payments/src/routes.ts`, `modules/payments/src/service.ts`, `modules/payments/src/schema.ts`, `apps/api/src/hono/security.ts`, `apps/api/src/index.ts`.

### D1 — Exempt the webhook from Bearer + tenant middleware
- [ ] **D1.1:** In `security.ts`, extend the skip predicate (currently only `/api/catalog/public`) to also match `/api/payments/gateways/:name/webhook`. The webhook resolves tenant from Stripe metadata (set at PI creation) or a per-gateway default — never from a request input.
```ts
const isPublicPath = (p: string) =>
  p === '/api/catalog/public' || p.startsWith('/api/catalog/public/') ||
  /^\/api\/payments\/gateways\/[^/]+\/webhook$/.test(p);
```

### D2 — Raw body + signature verification
- [ ] **D2.1: Failing test.**
```ts
// modules/payments/src/webhook.test.ts
describe('Stripe webhook', () => {
  it('rejects a request with a bad signature', async () => {
    const res = await app.request('/api/payments/gateways/stripe/webhook',
      { method: 'POST', headers: { 'stripe-signature': 'bad' }, body: '{}' });
    expect(res.status).toBe(400);
  });
  it('marks the payment COMPLETED on a valid payment_intent.succeeded for the right pi_ id', async () => {
    // construct a real signed event with stripe.webhooks.generateTestHeaderString
    // ...
    expect(payment.status).toBe('COMPLETED');
  });
  it('is idempotent: replaying the same evt_ id does nothing the second time', async () => { /* ... */ });
});
```
- [ ] **D2.2: Implement** — handler reads `const raw = await c.req.raw.text()` (raw body is already buffered at the bridge, `index.ts:165-170`), then:
```ts
const event = stripe.webhooks.constructEvent(raw, signature, decryptedWebhookSecret);
```
where `decryptedWebhookSecret` comes from the tenant's encrypted gateway config (Phase G encrypts it).
- [ ] **D2.3: Run → PASS. Commit.**

### D3 — Store `pi_…` as the external id; dedup events
- [ ] **D3.1:** In `createPayment`, set `gatewayPaymentId = intent.id` (`pi_…`), **not** `client_secret`. (Fixes R2c.)
- [ ] **D3.2:** At the top of the webhook handler:
```ts
const inserted = await db.insert(webhookEvents)
  .values({ tenantId, gatewayName: 'stripe', eventId: event.id })
  .onConflictDoNothing().returning();
if (inserted.length === 0) return { processed: true, replay: true };
```
- [ ] **D3.3:** On `payment_intent.succeeded`, look up by `eq(payments.gatewayPaymentId, pi.id)` **and** `eq(payments.tenantId, tenantId)` (fixes TN-style unscoped lookup), transition via the state machine + ledger post (Phase C4).
- [ ] **D3.4:** Fix R2e — return `200` only on success/replay; `400` on signature failure; `500` (and *do not* mark processed) on internal error so Stripe retries.
- [ ] **D3.5: Commit.**

---

## 11. Phase E — Renewal idempotency (R3/RE1/RE2/RE3)

**Goal:** one renewal per (subscription, period), period advances only after settlement, duplicate deliveries create no extra invoice or charge.

**Files:** Modify `modules/subscriptions/src/service.ts`, `modules/subscriptions/src/schema.ts`, `modules/billing/src/service.ts`, `modules/billing/src/schema.ts`, the renewal job registration in `modules/subscriptions/src/index.ts`.

### E1 — Idempotency keys
- [ ] **E1.1: Migration** adding:
```sql
ALTER TABLE subscriptions ADD COLUMN renewal_period_lock timestamptz;  -- optimistic lock target
-- invoice idempotency: one recurring invoice per (subscription, period)
CREATE UNIQUE INDEX invoices_recurring_unique
  ON invoices (tenant_id, subscription_id, period_start)
  WHERE invoice_type = 'recurring';
```
- [ ] **E1.2: Failing test (the double-fire case).**
```ts
describe('renewal idempotency', () => {
  it('two concurrent renewals of the same period produce exactly one invoice and one charge', async () => {
    await Promise.all([
      subs.processRenewal(subId, period),
      subs.processRenewal(subId, period),
    ]);
    const invs = await db.select().from(invoices).where(eq(invoices.subscriptionId, subId));
    expect(invs.filter(i => i.periodStart === period)).toHaveLength(1);
    expect(stripeChargesFor(subId)).toHaveLength(1);
  });
  it('does not advance the period if the charge fails', async () => { /* ... */ });
});
```
- [ ] **E1.3: Implement `processRenewal`:**
  1. Conditional update to claim the period (optimistic lock): `UPDATE subscriptions SET renewal_period_lock = now() WHERE id = ? AND tenant_id = ? AND (renewal_period_lock IS NULL OR renewal_period_lock < periodStart) RETURNING *`. Zero rows → another worker owns it; return.
  2. Create the recurring invoice (idempotent via E1.1 unique index; reads real plan price — Phase C5.2).
  3. Attempt charge via the payment service (per-tenant Stripe instance — Phase F1).
  4. **On success:** advance the period (`currentPeriodStart/End`, `nextBillingDate`) **in the same transaction** as the ledger post. **On failure:** enter dunning; do **not** advance.
- [ ] **E1.4: Run → PASS. Commit.**

### E2 — Unique BullMQ job key
- [ ] **E2.1:** The renewal sweep enqueues with `{ jobId: \`renewal:\${subscriptionId}:\${period}\` }` so BullMQ dedupes overlapping runs.

---

## 12. Phase F — Tenancy hardening in the new modules (NEW-A, TN1, TN2, TN3, NEW-C)

**Goal:** no cross-tenant money movement, no cross-tenant data read, no global sweep triggerable by a non-system admin.

**Files:** Modify `modules/payments/src/service.ts`, `modules/subscriptions/src/service.ts`, `modules/billing/src/{service,routes}.ts`, `modules/provisioning/src/service.ts`.

### F1 — Per-tenant Stripe instances (NEW-A)
- [ ] **F1.1: Failing test** — two concurrent `createCharge` for tenants A and B result in A's charge under A's key and B's under B's (assert via stubbed Stripe capturing the key used per call).
- [ ] **F1.2: Implement** a gateway cache keyed by `${tenantId}:${gatewayName}` returning a **new** `Stripe` instance per cache miss; never mutate a shared instance. Evict on config update.
```ts
private gwCache = new Map<string, Stripe>();
private async stripeFor(tenantId: string, name: string): Promise<Stripe> {
  const key = `${tenantId}:${name}`;
  let s = this.gwCache.get(key);
  if (!s) { const cfg = await this.loadConfig(tenantId, name); s = new Stripe(cfg.secretKey, { apiVersion: '2024-06-20' }); this.gwCache.set(key, s); }
  return s;
}
```
- [ ] **F1.3: Commit.**

### F2 — Tenant predicate everywhere (TN1) + scoped dunning (TN2) + ownership check (TN3)
- [ ] **F2.1:** Add `eq(*.tenantId, tenantId)` to the renewal UPDATE (`subscriptions/service.ts:215-224`) and audit every `update()/delete()` across modules for the predicate.
- [ ] **F2.2:** `runDunningCycle`/`sendOverdueReminders` take a `tenantId` and filter on it; `POST /dunning/run` is restricted to a system-admin permission (or scoped to the caller's tenant).
- [ ] **F2.3:** `GET /invoices/:id` with `invoicesViewOwn` adds an ownership predicate (`clientId === ctx.user.clientId`) — `requirePermission` is OR-only and does no ownership check, so the handler must.
- [ ] **F2.4:** Provisioning `getAdapter` cache keyed by `${tenantId}:${providerId}` (NEW-C); evict on update/delete; never return an adapter built from another tenant's provider row.
- [ ] **F2.5: One test per item; commit.**

---

## 13. Phase G — Encryption (R5) + provisioning honesty (D7)

### G1 — Fix encryption
**Files:** Modify `packages/core/src/encryption.ts`; handle legacy ciphertext.

- [ ] **G1.1: Failing test** — `encrypt`/`decrypt` round-trips; two encryptions of the same plaintext differ (IV is used); GCM `authTag` is verified (tampering throws).
- [ ] **G1.2: Implement** with `createCipheriv('aes-256-gcm', key, iv)` / `createDecipheriv`; store `base64(iv):base64(authTag):base64(ciphertext)`.
- [ ] **G1.3: Legacy migration** — the old `createCipher` output is not GCM and the stored IV/authTag are inconsistent with how it ran. Add a `migrate-encryption.ts` script: for each secret column, attempt decrypt-old; if it fails, require re-entry (the values are operator-supplied gateway secrets — there is no prod data per §open-questions, so a re-encrypt-on-reentry is acceptable). Document this.
- [ ] **G1.4: Fail closed** — call sites may **not** fall back to plaintext. `ctx.encryption` is required for modules that persist secrets; throw if absent (fixes R5b). Encrypt `webhookSecret` (fixes R5c); drop the misleading `[encrypted]` mask.
- [ ] **G1.5: Commit.**

### G2 — Provisioning honesty
**Files:** Modify `modules/provisioning/src/adapters/CpanelAdapter.ts`, `modules/provisioning/src/service.ts`, `modules/provisioning/src/schema.ts`.

- [ ] **G2.1:** Mutating ops (`provision`/`suspend`/`unsuspend`/`terminate`/`modify`/`reinstall`) throw `NotImplementedError` until the real WHM integration lands. (`testConnection`/`healthCheck` already hit WHM at `:2087` — keep.)
- [ ] **G2.2:** Implement real provisioning against the WHM API (JSON API `createacct` on `https://<host>:2087/json-api/createacct` with an API token), behind a feature flag so the M1 demo can run against a WHM sandbox. If no sandbox is available for M1, the demo shows the `NotImplementedError` path — honestly failing, per process rule #4.
- [ ] **G2.3:** Route `executeOperation` through the core JobScheduler: write `jobId`, honor `maxAttempts`, durable retry, dead-letter on exhaustion (fixes D7b).
- [ ] **G2.4: Compensation state** — add `service_instances.status = 'paid_unprovisioned'`; on `provisioning.failed` after a paid subscription, set it, emit an operator alert (audit-log entry now; email in M2), and surface in an admin dashboard widget (fixes D7c).
- [ ] **G2.5: Commit.**

---

## 14. Phase H — Transactional outbox + relay (D3, NEW-D)

**Goal:** state change + event emission are atomic; stranded events are redelivered.

**Files:** Modify `packages/core/src/events.ts`, `apps/api/src/lib/core/eventOutbox.ts`, `modules/billing/src/ledger/service.ts` (and every emit site that must become transactional).

- [ ] **H1:** `EventBus.emit` accepts an optional transaction handle. Domain writes that emit events call `emit` **inside** the same `db.transaction` as the state change (the ledger `post()` in C3 is the first consumer). The outbox insert moves inside that transaction. (Fixes the "non-transactional outbox" finding.)
- [ ] **H2: Relay.** A core job (`outbox-relay`, every 30s) scans `event_outbox WHERE status='pending' AND created_at < now()-interval '30 seconds'`, re-dispatches, marks `dispatched`. Rows stuck in `pending` past a threshold alert. (Fixes "no relay".)
- [ ] **H3: Kill the two-bus split (NEW-D).** Remove `ComponentLifecycleService`'s orphan `'events'` worker (deleted in Phase A); route lifecycle handling onto the core bus so `subscription.activated`/`terminated`/`suspended` actually reach their handlers.
- [ ] **H4: Test** — crash-sim: insert a `pending` outbox row with no matching dispatch, assert the relay redelivers it; assert a transactional emit that rolls back leaves no outbox row. Commit.

---

## 15. Phase I — CI as a hard gate (D5)

**Files:** `.github/workflows/*`, root + package `tsconfig.json`, a grep/lint gate.

- [ ] **I1:** CI job: `turbo run build` (strict tsc) — `packages/*`, `modules/*`, `apps/api`. Zero errors or the job fails.
- [ ] **I2:** CI job: `turbo run test` with pglite (no live Postgres). Port the 4 currently-failing tests that need Postgres to pglite. Money-path tests (Phases C–E) must run.
- [ ] **I3:** CI grep gate: `grep -rnE "parseFloat|\\* *100|/ *100" modules/billing modules/payments packages/core/src/money.ts` returns nothing in money context; `grep -rn "push:pg"` returns nothing; `grep -rn "createCipher(" packages modules` returns nothing.
- [ ] **I4:** Branch protection: CI green + 1 human review on money-path paths (`modules/billing`, `modules/payments`, `modules/subscriptions`, `packages/core/src/{money,events,jobs}`). No direct push to `main`/`dev`.

---

## 16. Phase J — M1 demo assembly (the milestone gate)

**Definition of done for M1:** the following script passes against a clean docker-compose + Stripe test mode + (WHM sandbox or `NotImplementedError`).

- [ ] **J1: Reconciliation test (the differentiator).**
```ts
describe('M1 reconciliation demo', () => {
  it('books reconcile to Stripe balance to the cent', async () => {
    const tenant = await seedTenant();
    const sub = await signupAndSubscribe(tenant, plan9_99);
    const pi = await pay(sub.firstInvoice);            // Stripe test payment
    await waitForWebhook(pi.id);                        // signature-verified, deduped
    await provision(sub);                               // WHM sandbox or NotImpl
    await timeTravelToNextBillingDate(sub);
    await runRenewalSweep();
    await refund(sub.lastPayment, 4_00);                // partial refund

    const booksStripeClearing = await ledgerBalance(tenant, 'stripe_clearing'); // DR-credits
    const stripeReport = await stripe.balance.retrieve();
    expect(booksStripeClearing).toBe(minorOf(stripeReport.net, tenant.currency)); // exact
  });
});
it('double-fire: delivering the renewal job 3x yields 1 invoice, 1 charge', async () => { /* RE1 */ });
it('double-fire: delivering payment_intent.succeeded 3x yields 1 COMPLETED payment', async () => { /* D3 */ });
it('forged webhook without signature is rejected', async () => { /* D2 */ });
it('refund persisted as a ledger entry + refund_records row; books still reconcile', async () => { /* C4 */ });
```
- [ ] **J2:** Document the demo run (录屏 / asciinema) — this is the artifact M2 design partners will want to see.

---

## 17. M2 / M3 (scoped; become their own plans after M1)

- **M2 — WHMCS importer.** Sub-plan TBD. Scope: read a WHMCS DB dump / CSV (clients `tbl_clients`, services `tbl_hosting`, invoices `tbl_invoiceitems`/`tbl_invoices`), map to Panel1 clients/subscriptions/invoices, **post opening balances to the ledger** (do not re-charge historical revenue — represent it as a single opening-balance ledger transaction so books stay reconciled). Idempotent re-runs keyed on WHMCS entity id. This is where 3–5 design partners' real exports break the importer; budget for that.
- **M3 — public launch.** Docs matching reality; one out-of-tree module (e.g. a second gateway or a PayPal adaptor) proving the extension contract; security review; the reconciliation demo + importer front-and-center.

---

## 18. What is explicitly NOT in scope (the freeze list — D7)

No PRs into these until M1 ships and a written spec + plan exists:

- Marketplace (`apps/web/src/lib/marketplace/`), analytics dashboards, the "best gateway" multi-gateway routing machinery, multi-strategy dunning campaign variants, SSL automation, domain registrars, the support/tickets module surface, permission-groups UI, i18n, and (unless D9 = hosted SaaS) multi-tenancy hardening (RLS, tenant-switching UI).

Items to **delete** (not freeze): the duplicate renewal plumbing (legacy path already removed in Phase A), the `bull` dependency if still present, `types/overrides.ts` (Phase A), the stubbed `CpanelAdapter` success paths (Phase G), the orphan `'events'` worker (Phase H), and whichever of `redis`/`ioredis` is redundant.

---

## 19. Risks & open questions

- **D9 (business model) is unresolved** and decides whether Phase F deletes the tenant-switching UI (single-tenant) or adds per-tenant unique keys (SaaS). Decide before Phase F. Recommendation: single-tenant, self-hosted (§3).
- **Has this ever touched real money?** Determines whether data-repair/disclosure matters or this is greenfield-in-practice. The encryption legacy-ciphertext migration (G1.3) is trivial if greenfield.
- **WHM sandbox availability for M1.** If unavailable, M1 demos the honestly-failing `NotImplementedError` path — acceptable per process rule #4, but weakens the demo. Secure a sandbox during Phase A.
- **Paymenter is compounding community monthly.** Time spent on frozen features is ceded ground; the discipline of refusing breadth (§4 rule #5) is load-bearing for the market window.
- **The reconciliation guarantee is only as good as its tests.** If the double-fire/reconciliation tests in J1 are not rigorous, the differentiator is marketing. Human review (rule #3) is the mitigation.

---

## 20. Self-review (per writing-plans skill)

1. **Spec coverage.** Every verified finding in §2 maps to a task: P0→Phase A; R3′→A7/E1; R2a–e→Phase D; NEW-A→F1; NEW-B→C5.2; R4/D2→Phase C; R4′→C4; SM1/2/3→C4/C5.3/C5.4; RE1/2/3→Phase E; TN1/2/3→F2; NEW-C→F2.4; R5→Phase G1; D7→Phase G2; non-tx outbox/no relay→Phase H; P2a–d→Phase B; false-green build→A4/B4; lockfile→A5. The market-analysis milestones → §6/§16/§17. No §2 row is unassigned.
2. **Placeholder scan.** Phases A, B, C, D, E contain real code, real SQL, real test code, and real commands. Phases F, G, H, I, J are specified with concrete files, interfaces, and acceptance tests but carry less line-by-line impl — these are the "decompose into per-module sub-plans" surfaces the skill's scope-check anticipates (a 6-week, 4-module rebuild genuinely cannot be one TDD-step-list). The ledger schema (C2), posting invariant (C3), webhook verification (D2), and double-fire tests (E1/J1) — the correctness core — are fully concrete.
3. **Type consistency.** `amount_minor bigint` + `currency char(3)` is used consistently. `webhook_events` primary key `(tenant_id, gateway_name, event_id)` matches D3.2. Ledger idempotency key `(tenant_id, source_type, source_id, period_start)` matches C3.1 and E1.1's invoice unique index on `period_start`. `renewal_period_lock` (E1.1) matches the optimistic-lock RETURNING in E1.3. `stripeFor(tenantId, name)` (F1.2) matches the cache key in NEW-A's fix.
4. **Honest gaps.** The exact rounding rule in C1.3 is pinned in code (round-half-to-even) but the test C1.1 asserts one outcome — implementer must make test and impl agree. G1.3's legacy-ciphertext migration depends on the open "real money?" question. M2 importer is deliberately not broken into tasks here (its own plan post-M1).

---

## 21. Suggested order

**Week 1:** Phase A (un-break build, kill R3 vector) + Phase B (security) in parallel. Get the tree green and booting under strict TS + real migrations.
**Week 2:** Phase C (D2 money core) — the gating design. Land the ledger, minor units, state machines, and the balance/idempotency tests. **Decide D9.**
**Weeks 3–4:** Phase D (webhook) → Phase E (renewal idempotency). These are where the double-charge/duplicate-invoice vectors die; they depend on C.
**Weeks 4–5:** Phase F (tenancy) + Phase G (encryption/provisioning) + Phase H (transactional outbox) interleaved.
**Week 5:** Phase I (CI gate) lands as the preceding phases merge, not after.
**Week 6:** Phase J (M1 demo) — the milestone gate. Recruit M2 design partners in parallel from week 1.
