# Panel1 — Technical Due-Diligence Review (2026-07-12)

Scope: full read-only review of the `dev` branch (~55.7k LOC TS). Every finding cites files actually read. Verification commands run: `tsc --noEmit` (API), `turbo run test` (all packages). No code was modified.

---

## 1. Executive summary

This repository is two projects sharing a folder. The first is the new module system (`packages/core`, `packages/types`, `modules/audit`, ~1.9k LOC): small, coherent, tested, and matching ARCHITECTURE.md. The second is the legacy application (~52k LOC in `apps/api` + `apps/web`): a large body of service code whose billing core is **not functional** — it fails its own type-check with **515 errors**, writes enum values and columns that do not exist in the database schema, has no route through which a payment webhook can ever arrive, does all money arithmetic in floats, has no ledger, no idempotency anywhere, two divergent renewal implementations, a stubbed provisioning adapter that returns hardcoded success, and an unauthenticated audit API that leaks cross-tenant PII. The polish is superficial: interfaces, JSDoc, and event names look production-grade while the paths underneath silently no-op or crash. My verdict: **continue on the new module-system foundation and rebuild billing/payments/subscriptions as modules on it; treat the legacy `apps/api/src/lib` code as a quarry for ideas, not as a base to fix incrementally.** The schema is salvageable with rework; most of the service layer is not worth the audit effort required to trust it with money.

## 2. Module map with implementation status

Taxonomy: IMPLEMENTED / PARTIAL / STUBBED / ABSENT-BUT-ASSUMED. LOC from `wc -l`. Test coverage is zero except where noted.

| Module | Responsibility | Status | Evidence |
|---|---|---|---|
| `packages/core` (620 LOC) | Module loader, event bus, service/filter registries, DB manager | IMPLEMENTED (minimal) — but `JobScheduler` only stores registrations, never executes (`packages/core/src/jobs.ts`, 22 LOC, no cron/run loop) | 5 passing test files |
| `packages/types` (344 LOC) | Module contract types | IMPLEMENTED — but `ctx.db`/`ctx.routes` typed `unknown`, so the contract is not type-enforced (`packages/types/src/module.ts:21,27`) | — |
| `modules/audit` (927 LOC) | Audit log module (the only migrated module) | PARTIAL — service + OpenAPI routes real; **no authentication on any route**; cleanup job is a log-only stub (`modules/audit/src/index.ts:36-39`) and would never fire anyway (core scheduler stub) | — |
| Auth (`apps/api/src/lib/auth.ts`, `lib/auth/`) | JWT + DB sessions, RBAC | IMPLEMENTED — bcrypt(12), DB-backed session lookup; hardcoded JWT secret fallback (`auth.ts:9`) | 0 tests |
| Invoicing (`lib/invoice/`, 1.3k LOC) | Numbering, tax, PDF, emails | PARTIAL — numbering has a read-modify-write race; tax reads a nonexistent column so it is permanently disabled (below) | 0 tests |
| Payments (`lib/payments/`, 1.9k LOC) | Gateway abstraction, Stripe, webhooks, refunds | PARTIAL/BROKEN — no webhook HTTP endpoint exists; refunds never persisted; ID-space mismatch makes webhook status updates no-ops | 0 tests |
| Subscriptions (`lib/subscription/`, 1.5k LOC + `SubscriptionRenewalProcessor`) | Create/renew/cancel, dunning | PARTIAL — two divergent renewal engines; retry wrapper duplicates invoices; enum drift crashes status transitions | 0 tests |
| Jobs (`lib/jobs/`, 1.5k LOC) | BullMQ queues + node-cron | PARTIAL — re-enqueue loop duplicates jobs every 30 min; queries a nonexistent `payments.attemptCount` column | 0 tests |
| Provisioning (`lib/provisioning/`, ~800 LOC) | cPanel/WHM adapter | STUBBED — `CpanelAdapter.provision()` returns hardcoded `test_user` success without calling WHM (`CpanelAdapter.ts:29-52`); suspend/terminate/healthCheck likewise | 0 tests |
| Catalog/components (`lib/catalog/`, `lib/components/`, ~2k LOC) | Product/component definitions, lifecycle | PARTIAL — the only tested API code: 11 tests pass, 4 fail (require live Postgres) | partial |
| Domains/SSL/Support plugins (`lib/plugins/`, `lib/domains/`, `lib/ssl/`, `lib/support/`) | Registrar, SSL, tickets | PARTIAL-to-STUBBED (not deep-reviewed; registration is hardcoded in `index.ts:171-181`) | 0 tests |
| Ledger / credits / accounting | — | **ABSENT** — zero hits for ledger/credit-balance/double-entry in the entire API | — |
| WHMCS import / data migration | — | ABSENT | — |
| `apps/web` (21.1k LOC) | Admin + client + store UI | PARTIAL — large admin surface; store checkout collects **no payment** (below); proration calculator lives client-side | 0 tests |

Test totals: 15 API tests (4 failing), 5 core test files. Nothing on payments, invoices, renewals, tax, or auth.

## 3. Architecture findings

**Intended vs. actual.** ARCHITECTURE.md describes a modular monolith: vertical-slice modules over `@panel1/core`, Hono REST, services as public API, one event bus. The code implements this for exactly one module (audit). The other ~95% is a singleton-service architecture (`getInstance()` everywhere) where tRPC routers reach directly into `db` and schema tables — the opposite of "modules never import another module's schema."

**Parallel infrastructure, three of everything.**
- Two HTTP frameworks: Express+tRPC (all real functionality) and Hono (audit only), bridged by a hand-rolled request adapter (`apps/api/src/index.ts:115-144`).
- Three event systems: BullMQ `EventService` (`lib/events/EventService.ts`), the in-memory core `EventBus` (`packages/core/src/events.ts`), and direct handler registration on `EventProcessor`. They do not interoperate.
- Two queue libraries: `bullmq` everywhere except `SubscriptionRenewalProcessor.ts:1`, which imports `bull`.
- Two job schedulers: `lib/jobs/JobScheduler` (node-cron + BullMQ) and the core registry stub.

**Critical queue misuse.** Two BullMQ `Worker`s consume the *same* `events` queue: `EventProcessor` (`lib/jobs/processors/EventProcessor.ts:20-22`) and `ComponentLifecycleService` (`lib/components/ComponentLifecycleService.ts:110`). BullMQ queues are work queues — each job is delivered to exactly one worker. So every emitted event is consumed by a coin-flip: `subscription.activated` handled by `ComponentLifecycleService` triggers provisioning; handled by `EventProcessor` it hits a `// TODO Phase 2` log line (`EventProcessor.ts:166-170`). Provisioning after payment is nondeterministic by design.

**Type system is not a contract.** `tsc --noEmit` on the API produces **515 errors**; strict mode is disabled repo-wide with a "re-enable in v0.1.1" TODO (`apps/api/tsconfig.json:23-33`). `src/types/overrides.ts` monkey-patches drizzle's types to silence errors. Consequence: the schema drift catalogued in §4 compiles into the dev server (`tsx watch`) and only fails at runtime. The new CI workflow (`.github/workflows`) runs `type-check` and would fail on the current tree.

**Extension model.** The `PaymentGateway` interface (`lib/payments/interfaces/PaymentGateway.ts`, 331 LOC) is a reasonable contract, but registration is hardcoded (`PaymentService.registerGateways()` registers Stripe with a TODO for others — `PaymentService.ts:58-65`), as is provisioning-handler registration (`index.ts:171-181`). A third party cannot add a gateway or registrar without editing core. The new `ModuleDefinition` contract is the right shape but is enforced by convention, not types (`db: unknown`).

**Data model / tenancy.** Multi-tenancy is a nullable `tenant_id` column on every table (`invoices.ts:27`, `payments.ts:31`) — rows can exist with no tenant, and isolation depends on every query remembering the filter. Routers mostly do; the webhook path passes `result.data?.metadata?.tenantId || ''` (`PaymentService.ts:304`). No RLS, no composite unique constraints per tenant, no soft deletes (client delete cascades subscriptions — `subscriptions.ts:15`). **Migration safety: there are 4 migration files but `db:migrate` actually runs `drizzle-kit push:pg`** (`apps/api/package.json`), i.e. destructive schema push; the migration files are stale decoration, and `packages/core/src/db.ts` has no migration runner despite ARCHITECTURE.md promising one.

**Accidental complexity.** Multi-gateway "best gateway" selection, multi-strategy dunning campaigns, marketplace manager (`apps/web/src/lib/marketplace/`), analytics router, permission groups — all built atop a core that cannot yet accept one payment end-to-end. The load-bearing, justified complexity — an idempotent payment/renewal pipeline — is the piece that's missing.

## 4. Billing-correctness findings (most detailed)

**4.1 Money representation — floats throughout.** Storage is `decimal(10,2)` (adequate), but every computation round-trips through JS floats: `parseFloat(payment.amount)` (`PaymentService.ts:100,245`), `parseFloat(invoice.total)` (`SubscriptionRenewalProcessor.ts:151,169`), `Math.round(params.amount * 100)` at the Stripe boundary (`StripeGateway.ts:150`), `subtotal + taxResult.amount` then `.toString()` (`SubscriptionRenewalProcessor.ts:100-112`). Proration is float math with no rounding rule, and it lives in the **frontend** (`apps/web/src/lib/billing/ProrationCalculator.ts:40`). No money library, no minor-units convention, no per-currency exponent handling (JPY through `amount * 100` is wrong). *Failure mode: penny drift between invoice, gateway charge, and books; unreconcilable totals.*

**4.2 Ledger — absent.** No ledger, credit, or journal table exists (zero grep hits repo-wide). State is mutable status flags on `invoices`/`payments`. `payments.refundedAmount` exists in schema but is **never written** by any code path. Books cannot be reconstructed or reconciled; there is no event log of money movements. This is the single largest structural gap for a billing product.

**4.3 Webhooks — unreachable, and broken if reached.**
- **No HTTP route exists.** `handleWebhook` is referenced only inside `lib/payments/` (interface, service, gateway). Nothing in `index.ts` or any router mounts `/webhooks/*`. Stripe async confirmations (3DS, bank redirects, disputes) can never arrive. ABSENT, though the code looks IMPLEMENTED.
- Signature verification uses `JSON.stringify(payload)` (`PaymentService.ts:294`) — Stripe signatures are computed over the raw body; re-serialization fails verification, so even a mounted route would reject every event.
- ID-space mismatch: `StripeGateway.handlePaymentIntentSucceeded` returns `paymentId: paymentIntent.id` (a `pi_…` string, `StripeGateway.ts:347`), which `updatePaymentStatus` uses in `eq(payments.id, paymentId)` — a UUID column (`PaymentService.ts:216`). The update matches zero rows and the code logs success anyway.
- Double emission: the gateway emits `payment.succeeded` (`StripeGateway.ts:332`) *and* `updatePaymentStatus` emits it again (`PaymentService.ts:241`). Each emission independently marks the invoice paid and advances the renewal (§4.5).
- No idempotency: no processed-event table, no dedup on Stripe `event.id`. Every path is at-least-once with no guard.

**4.4 Schema/service drift — code written against a database that doesn't exist.** These compile only because strict checking is off; at runtime they throw Postgres errors or silently misbehave:
- Invoice status `'FAILED'` is not in `invoice_status` enum (`PaymentEventHandler.ts:225` vs `invoices.ts:10`) → failed-payment handling **crashes**.
- Subscription statuses `'PENDING'`, `'PAYMENT_PENDING'`, `'SUSPENDED'` are not in the enum (`PaymentEventHandler.ts:275-278` vs `subscriptions.ts:8-11`) → post-payment activation/unsuspension never fires.
- `payments.attemptCount` doesn't exist (`JobScheduler.ts:255`; schema has `retryCount`) → the hourly failed-payment retry cron **crashes**, so payment retry is effectively ABSENT.
- `payments.gatewayData`/`errorMessage` don't exist (`SubscriptionRenewalProcessor.ts:202,230`; schema: `gatewayResponse`, `failureReason`).
- `invoices.metadata` doesn't exist (`SubscriptionRenewalProcessor.ts:117-123`) → renewal invoice insert fails.
- `tenants.metadata` doesn't exist — schema has `settings` (`tenants.ts:10`). `TaxCalculationService.ts:44` reads `tenant.metadata?.taxSettings`, always undefined → **tax is permanently disabled for every tenant regardless of configuration**, and the catch-all returns 0 tax on any error (`TaxCalculationService.ts:76-85`).
- `payments.gatewayName/fee/gatewayTransactionId`, `invoices.clientEmail/description`, status `'SUCCESS'` — none exist (`routers/payment-gateways.ts:75-110`) → admin transaction list cannot work.

**4.5 Renewal engine — two divergent implementations, both duplicate-charge-prone.**
- Path A: `SubscriptionRenewalProcessor.process()` (Bull worker) creates invoice, charges synchronously, marks PAID, advances the period anchored at `currentPeriodEnd` (`SubscriptionRenewalProcessor.ts:244-288` — the correct anchor).
- Path B: `SubscriptionService.processRenewal()` → `payment.succeeded` → `PaymentEventHandler.handleSubscriptionRenewalSuccess`, which anchors the next period at **`new Date()`** (`PaymentEventHandler.ts:145-147`) → every renewal processed this way shifts the customer's billing date by processing latency; double-processed events extend it twice.
- `processRenewal` wraps *invoice creation + payment* in `retryManager.executeWithRetry(maxAttempts: 3)` (`SubscriptionService.ts:247-324`) → a transient failure after invoice insert creates up to 3 invoices, potentially 3 charges.
- `JobScheduler.processScheduledJobs()` re-enqueues every DB job still in `pending` every 30 minutes without marking it enqueued (`JobScheduler.ts:309-345`), while `addJob` already queued it once → routine duplicate renewal jobs. The daily 1 AM sweep (`JobScheduler.ts:210-243`) also re-enqueues any subscription whose period wasn't advanced (e.g., because Path B crashed on enum drift). No unique job keys, no distributed locks, and cron runs in-process — every API replica schedules everything again.
- *Renewal-due check* `currentPeriodEnd > now → skip` (`SubscriptionRenewalProcessor.ts:29-35`) is the only dedup, and it's race-prone between the invoice insert and period advance.

**4.6 Refunds/credits/chargebacks.** `processRefund` selects a gateway via `getBestGateway` — priority-based selection that can return a *different* gateway than the one that took the payment (`PaymentService.ts:98-102`). The refund result is returned to the caller and **never persisted** — no update to `payments`, no credit note, no invoice adjustment (`PaymentService.ts:124-127`). Dispute webhooks are acknowledged and dropped (`StripeGateway.ts:419-432`). Cancellation refund logic exists in `SubscriptionService.cancelSubscription` (`:402+`) but feeds the same non-persisting refund path. *Failure mode: money leaves Stripe, Panel1's records still say PAID in full.*

**4.7 Invoice numbering race.** `InvoiceNumberService.generateInvoiceNumber` does SELECT-then-UPDATE inside a transaction with no row lock (`InvoiceNumberService.ts:28-72`). Under READ COMMITTED, two concurrent renewals read the same `lastNumber` and produce the same invoice number; the `invoiceNumber` unique constraint then aborts one invoice creation mid-renewal. Needs `UPDATE … SET last_number = last_number + 1 RETURNING` or `SELECT … FOR UPDATE` plus upsert on the `(tenantId, year)` unique key.

**4.8 Invoice payment marking.** `handlePaymentSucceeded` sets `status='PAID'` unconditionally (`PaymentEventHandler.ts:56-68`): no check that the payment amount covers the invoice total, no partial-payment concept, no invoice→payment state machine, no guard against paying a CANCELLED invoice.

**4.9 Billing↔provisioning boundary — no saga, plus a stubbed provider.** After payment, provisioning depends on (a) the event winning the dual-worker coin flip (§3), then (b) `CpanelAdapter.provision()`, which returns `{success: true, remoteId: 'test_user', password: 'generated_password'}` without contacting WHM (`CpanelAdapter.ts:34-43`). There is no compensation path anywhere: payment success + provisioning failure leaves a paid, unprovisioned service with no flag, no retry linkage to the invoice, no operator alert. Checkout (`apps/web/src/pages/store/CheckoutPage.tsx:46-94`) fires three independent mutations — createClient, createSubscription, createInvoice — with no transaction and **no payment-collection step at all**: the storefront cannot take money.

**Production failure modes a hosting provider hits, ranked:** (1) customers double-charged on renewals; (2) invoices stuck PENDING forever because webhooks can't arrive; (3) VAT/GST silently charged at 0 → tax-authority exposure; (4) refunds issued at the gateway but invisible in the system; (5) paid services never provisioned, at random; (6) renewal dates drifting later every cycle; (7) duplicate invoice numbers under month-end load.

## 5. Risk register (sorted by severity)

| # | Severity | Finding | Business impact |
|---|---|---|---|
| R1 | CRITICAL | `/api/audit/*` has **zero authentication**; `tenantId` is taken from query/header/body (`modules/audit/src/routes.ts:311,328,340`) | Anonymous cross-tenant exfiltration of audit logs (user IDs, IPs, old/new values = PII), plus forged audit-log injection |
| R2 | CRITICAL | Webhook pipeline unreachable + non-idempotent + ID-mismatched (§4.3) | Payments never reconcile; any future fix without idempotency double-credits |
| R3 | CRITICAL | Renewal duplication vectors: retry-wrapped invoice+charge, 30-min re-enqueue, dual implementations (§4.5) | Direct double-charging of customers — the fastest way to lose trust and trigger disputes |
| R4 | CRITICAL | No ledger; refunds and disputes unpersisted (§4.2, §4.6) | Books cannot be audited or reconciled; financial reporting impossible |
| R5 | HIGH | `EncryptionService` uses deprecated `crypto.createCipher` — the random IV at `EncryptionService.ts:67` is **never passed to the cipher**; key+IV derived deterministically from the key → AES-GCM nonce reuse for all gateway secrets; API removed in modern Node (runtime throw on upgrade) | Gateway API keys at rest are decoratively encrypted; nonce reuse in GCM breaks confidentiality and authenticity |
| R6 | HIGH | Schema/enum drift crashes payment-failure handling, payment retry, renewal invoice insert; tax permanently zero (§4.4) | Core billing flows fail at runtime the first time they're exercised |
| R7 | HIGH | `JWT_SECRET` falls back to a hardcoded string (`lib/auth.ts:9`). Mitigated: sessions are validated against the DB (`auth.ts:107-121`), so a forged JWT alone doesn't authenticate — but any code path trusting `verifyToken` alone reopens it | Account takeover if the fallback ships and any verify-only path exists |
| R8 | HIGH | Type-check: 515 errors, strict off, overrides file suppressing drizzle types; new CI would fail on current tree | "It compiles" guarantees nothing; drift keeps accruing invisibly |
| R9 | HIGH | Tests: 15 API tests (4 fail without a live DB — tests hit real Postgres); zero tests on money paths | The exact paths that lose customer money are unverified |
| R10 | MEDIUM | Tenancy: nullable `tenant_id`, filter-by-convention, `tenantId \|\| ''` in webhook path; no RLS | One forgotten `where` = cross-tenant data leak |
| R11 | MEDIUM | Dual-worker `events` queue nondeterminism (§3) | Provisioning/lifecycle events randomly dropped |
| R12 | MEDIUM | Operability: 268 `console.log`s (some with payment payloads), Logger bypassed, no metrics/tracing, job DB statuses partially maintained, trivial health check | Undiagnosable production incidents |
| R13 | MEDIUM | No rate limiting or brute-force protection on auth; CSP allows `unsafe-inline`/`unsafe-eval` (`index.ts:35`) | Credential stuffing; XSS blast radius |
| R14 | LOW | Dead/duplicated code: `bull` vs `bullmq`, deleted example plugin, 32 TODOs, `types/overrides.ts`, hardcoded CORS localhost list in prod branch (`index.ts:44-67`) | Drag on every future change |
| R15 | LOW | cPanel password generator uses `Math.random()` (`CpanelAdapter.ts:157-164`) | Predictable provisioned credentials (moot while stubbed) |

## 6. Gap analysis (vs. minimal WHMCS migration)

**Must-have for a first real customer (all currently missing or broken):**
- One end-to-end money path: order → payment collection (checkout has none) → webhook receipt (no route) → idempotent invoice settlement → provisioning (adapter stubbed) → renewal (duplicate-prone) → dunning → suspension.
- Correct money core: minor-units representation, ledger/credit-notes, persisted refunds.
- Real migrations (not `push:pg`) and a WHMCS data importer (clients, services, invoices) — ABSENT; this is the single biggest adoption blocker for the stated positioning.
- Tax that actually reads its configuration.

**Must-have for a credible open-source launch:**
- Green CI (0 type errors, strict on), tests on money paths, docker-compose install story (exists), module developer docs matching reality, a stable gateway + provisioning extension contract with at least one real out-of-tree example.

**Nice-to-have, defer indefinitely — including things currently built:**
- Marketplace (`apps/web/src/lib/marketplace/`), analytics dashboards, "best gateway" multi-gateway routing, multi-strategy dunning campaigns, SSL/domain/support modules, permission groups UI, i18n, and arguably **multi-tenancy itself** — WHMCS migrants self-host single-tenant; a `tenant_id` column can stay, but building SaaS-grade isolation now is premature.

## 7. Decision list

**D1. Foundation: rebuild billing on the module system vs. repair legacy in place.**
Options: (a) fix legacy services incrementally; (b) rebuild billing/payments/subscriptions as `modules/` on `@panel1/core`, quarrying legacy; (c) full greenfield rewrite.
Trade-offs: (a) preserves apparent progress but every §4 finding is load-bearing — you'd rewrite most files anyway while carrying 515 type errors; (c) discards a usable schema draft, working auth, and a decent admin UI. Reversibility: (b) is cheap to reverse per-module; (a) compounds. **Recommendation: (b).** The audit module proves the pattern; billing is the next module, done correctly.

**D2. Money and ledger design — decide before any more billing code.**
Options: integer minor units + double-entry ledger tables (payments, credits, refunds as journal entries); or keep decimal columns + a money library (dinero.js/big.js) + append-only transaction log. Trade-offs: double-entry costs ~1-2 weeks now, enables reconciliation forever; retrofitting after real customer data is 10x. Reversibility: near-zero once invoices exist in production. **Recommendation: minor-units integers, double-entry ledger, invoice/payment state machines enforced in one service.**

**D3. One event/queue architecture.**
Options: BullMQ named queues with one consumer each + a transactional outbox table for emission; or core in-memory EventBus + outbox, BullMQ only for jobs. Trade-offs: the outbox is what actually fixes atomicity (state change + event emit in one DB transaction); in-memory bus is simpler until multi-process. Reversibility: moderate. **Recommendation: core EventBus + Postgres outbox now; BullMQ solely for scheduled/retryable jobs with unique job keys. Kill the dual-worker `events` queue immediately regardless.**

**D4. Tenancy scope.**
Options: single-tenant-first (keep `tenant_id`, hardcode one tenant, drop tenant-switching surface); or fix multi-tenancy properly (non-null `tenant_id`, RLS, per-tenant unique keys). Trade-offs: proper multi-tenancy is weeks of work serving zero current users; single-tenant matches the WHMCS-replacement buyer. Reversibility: keeping the column makes later multi-tenancy a migration, not a rewrite. **Recommendation: single-tenant-first.**

**D5. Type discipline and CI gate.**
Options: strict-on + fix-to-zero before new features; or ratchet (no new errors, burn down weekly). Trade-offs: fix-to-zero on legacy code you may delete (D1) is wasted; ratchet on kept code only. **Recommendation: strict-on for `packages/*`, `modules/*`, and every new module from day one; delete `src/types/overrides.ts`; legacy `lib/*` gets deleted, not fixed. CI red = no merge.**

**D6. Payment scope.**
Options: Stripe-only, webhook-first, idempotent; or preserve the multi-gateway abstraction. Trade-offs: "best gateway" selection adds routing complexity with one gateway registered; the interface can stay, the *selection machinery* goes. Refunds must route to the originating gateway by stored reference, never by re-selection. **Recommendation: Stripe-only until the module contract survives a second gateway written out-of-tree.**

**D7. What to freeze or delete now.**
Freeze: marketplace, analytics, SSL/domain/support plugins, permission groups, dunning strategy variants. Delete: one of the two renewal implementations (keep neither's plumbing — reimplement in the billing module), `bull` dependency, `types/overrides.ts`, the stubbed `CpanelAdapter` success paths (a stub that reports success is worse than a `NotImplementedError`). **Recommendation: as listed; anything that pretends to work must fail loudly instead.**

**D8. Security triage independent of the rewrite.**
Auth on `/api/audit/*`, replace `EncryptionService` internals with `createCipheriv` + real random IV (re-encrypt stored secrets via the existing `encrypt-existing-secrets` script), remove the JWT secret fallback (fail closed), rate-limit auth. **Recommendation: do all four this week; they're small and none depend on architectural decisions.**

## 8. Sequenced next steps

**Next 2 weeks (stop-the-bleeding + decisions):**
1. Ship D8 security fixes (audit-route auth, cipher fix, JWT fail-closed, rate limit).
2. Make D1-D4 decisions; write the billing-module design doc: schema (minor units, ledger, invoice/payment state machines), event outbox, idempotency keys.
3. Turn CI into a real gate: strict typing scope per D5, tests must pass without a live DB (testcontainers or pglite for the 4 failing tests).
4. Remove the second `events`-queue worker and the 30-minute re-enqueue loop — even the legacy path shouldn't double-charge while it lives.
5. Freeze list from D7 communicated and enforced (no PRs into frozen areas).

**Next 6 weeks (one vertical slice, done right):**
6. Build `modules/billing` + `modules/payments` on `@panel1/core`: ledger, invoices, Stripe with a mounted raw-body webhook endpoint, event-ID dedup table, refunds persisted to the ledger.
7. Build `modules/subscriptions`: single renewal engine, period anchored at `currentPeriodEnd`, unique renewal job key per (subscription, period), tested for the double-fire cases found here.
8. Make `CpanelAdapter` real against a WHM sandbox (or keep it honestly failing); wire the paid→provisioned saga with an explicit compensation state (`paid_unprovisioned` + operator alert).
9. Real drizzle migrations as the only schema path; delete `push:pg` from scripts.
10. Implement core `JobScheduler` execution so module-declared cron jobs actually run.
11. Target: one demo tenant completes signup → pay (Stripe test) → provision → renew → refund with books that reconcile to Stripe's balance report to the cent.

**Explicitly NOT yet:** second payment gateway, domain registrars, SSL automation, marketplace, analytics, multi-tenancy hardening, support module, WHMCS importer (starts after the money core is trustworthy — importing customers into a system that double-charges is negative progress).

## 9. Open questions I could not answer from the code alone

1. Has any tenant/user ever run this against real money (production Stripe keys, live data)? Determines whether data-repair and disclosure matter or this is greenfield-in-practice.
2. How much of `apps/api/src/lib` was generated/scaffolded vs. hand-reviewed? The drift pattern (code targeting columns that never existed) suggests generation against an imagined schema; knowing which parts had human review would refine the quarry-vs-delete line.
3. Is the `.zcode/plans` / `.factory/reports` tooling output an active roadmap? I found a Phase-0 modularity analysis; if a phased migration plan already exists, D1 sequencing should align with it.
4. Web checkout intent: is the store meant to be customer-facing v1, or admin-assisted ordering first? It changes whether Stripe Elements integration is in the 6-week slice.
5. Deployment target (single VPS? k8s? managed PG/Redis?) — affects outbox vs. BullMQ trade-offs and whether in-process cron is acceptable short-term.
6. Licensing/positioning constraint: is multi-tenancy a monetization plan (hosted SaaS) or incidental? Drives D4's reversibility budget.
