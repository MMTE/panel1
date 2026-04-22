# Panel1 — Migration-Surface Audit (Phases 3 & 4)

> Scope: domains that still live under `apps/api/` and must move into `modules/*`
> during Phase 3 (billing, payments, subscriptions, provisioning) and Phase 4
> (domains, ssl). `catalog`, `support`, `audit` are already migrated and are
> **excluded**. Generated: 2026-04-22. Source revision: branch `dev`, HEAD
> `1a9df94`.

---

## 0. Methodology

- LOC counted with `wc -l` on each source file (see `Execute` calls in the audit
  session). Where only part of a file is in scope (e.g. a `router({...})` block
  inside a plugin), the procedure count is from direct inspection.
- Procedure counts come from reading the full `router({...})` literal of each
  tRPC router (`apps/api/src/routers/*.ts`) plus the `getRouter()` closures
  inside `lib/plugins/domain/DomainPlugin.ts` and `lib/plugins/ssl/SslPlugin.ts`.
- Cross-domain coupling was discovered by grepping for `emit(`, `.on(`, and
  cross-module `import` paths across `apps/api/src/lib/**`.
- All schema analysis from `apps/api/src/db/schema/*.ts` barrel (single source
  of truth, per issue 1.8).
- **Already-scaffolded**: `modules/billing/` and `modules/payments/` already
  contain `index.ts + schema.ts + routes.ts + service.ts + types.ts` and are in
  the active `apps/api/src/config.ts` module list. Phase 3 work is therefore
  "finish the migration and retire the apps/api side" — not greenfield.
  Subscriptions, provisioning, domains, ssl are **not yet** scaffolded.

---

## 1. Billing Domain (Phase 3.2 — `modules/billing/`)

### 1.1 File inventory (source of truth in `apps/api/`)

| Path | LOC | Purpose |
|---|---:|---|
| `lib/invoice/InvoiceNumberService.ts` | 145 | Tenant-scoped atomic per-year counter (`INV-YYYY-NNNNNN`). Uses `invoice_counters` table + txn. |
| `lib/invoice/InvoicePDFService.ts` | 355 | PDFKit invoice rendering: fetches invoice+items+client+tenant, draws header/items/totals. |
| `lib/invoice/InvoicePDFStandards.ts` | 194 | Standard payment-term lookups (B2C/B2B by country). Pure constants/util. |
| `lib/invoice/TaxCalculationService.ts` | 174 | EU VAT / US sales tax / AU GST lookup keyed off tenant+client metadata. **Reads `tenants.metadata.taxSettings`** — cross-table but not cross-module. |
| `lib/invoice/InvoiceEmailService.ts` | 130 | Nodemailer transport + `created|paid|overdue|reminder` templates. Duplicates `@panel1/core` email. |
| `lib/invoice/InvoiceEventHandler.ts` | 130 | Static helpers `handleInvoiceCreated/Paid/Overdue` — fetches + sends email. Called directly (not via event bus). |
| `lib/invoice/ComponentInvoiceService.ts` | 121 | Creates invoice from `subscription_components`. Emits `invoice.created` on legacy `EventService`. |
| `lib/dunning/DunningEmailService.ts` | 341 | 12 dunning email templates (`payment_failed_day_N`, `gentle_reminder_day_N`, `grace_period`, `suspension`, `cancellation`). |
| `routers/invoices.ts` | 719 | tRPC router — see §1.2. |
| **Total billing LOC** | **2,309** | — |
| Tests | **0** | No invoice/dunning tests today. |

### 1.2 Public tRPC surface (`invoicesRouter`, 9 procedures)

| Procedure | Kind | In → Out (abbrev) |
|---|---|---|
| `getAll` | query | `{limit,offset,search,status,dateFrom,dateTo}` → `{invoices[],total,hasMore}` |
| `getById` | query | `{id}` → invoice w/ `client,items,payments` (relational) |
| `getStats` | query | `∅` → `{totalInvoices,totalAmount,paidAmount,pendingAmount,overdueAmount}` |
| `create` | mutation | `{clientId,subscriptionId?,items[],tax,dueDate,currency}` → `Invoice` |
| `updateStatus` | mutation | `{id, status}` → `Invoice` |
| `generatePDF` | query | `{id}` → `{pdf(base64), filename, mimeType}` |
| `getByClient` | query | `{limit,offset,status?}` → `{invoices[],total,hasMore}` (client portal) |
| `processPayment` | mutation | `{invoiceId,paymentMethodId?,savePaymentMethod}` → `{paymentIntentId,clientSecret,…}` |
| `confirmPayment` | mutation | `{paymentIntentId,paymentMethodId?}` → `{success,paymentId,status}` |

### 1.3 Schema — billing-owned tables

| Table | Key columns | FKs crossing domains |
|---|---|---|
| `invoices` | id, invoiceNumber (unique), status enum (`DRAFT|PENDING|PAID|OVERDUE|CANCELLED`), subtotal/tax/total, currency, dueDate, paidAt, invoiceType, parentInvoiceId (self) | `client_id → clients.id`, `user_id → users.id`, `subscription_id → subscriptions.id`, `tenant_id → tenants.id` |
| `invoice_items` | id, invoiceId, description, quantity, unitPrice, total | `invoice_id → invoices.id` (cascade) |
| `invoice_counters` | id, tenantId, year, lastNumber, prefix, suffix (unique(tenantId, year)) | `tenant_id → tenants.id` |
| `dunning_attempts` | id, subscriptionId, campaignType, attemptNumber, status, scheduledAt, executedAt, nextAttemptAt, metadata | `subscription_id → subscriptions.id`, `tenant_id → tenants.id` |

**Cross-module FKs to be resolved via service calls**: `subscriptions`,
`clients`, `payments` (payments now live in `modules/payments`). Invoice↔Payment
is especially load-bearing — `invoices.ts` has `with: { payments: true }` in
Drizzle relational queries.

### 1.4 Cross-domain coupling

- **Imports of other domains**:
  - `routers/invoices.ts` → `lib/payments/PaymentService` (dynamic `import()` to
    run `getBestGateway / createPaymentIntent / confirmPayment`). ❌ must become
    service-registry call (`ctx.service<IPaymentService>('payments')`).
  - `ComponentInvoiceService.ts` → `db/schema` (`subscriptions`,
    `subscriptionComponents`) + `events/EventService`. ❌ cross-module DB read.
  - `TaxCalculationService.ts` → `db/schema` (`tenants`). ✅ OK — tenants is
    core-owned.
- **Event emits**: `ComponentInvoiceService.ts` emits `invoice.created`. No
  other invoice events are emitted today (see §1.9).
- **Event listens** (expected by current code but not yet wired):
  `payment.succeeded` currently calls `db.update(invoices…)` **from
  `PaymentEventHandler` inside `lib/payments/`**. When billing owns the table
  this becomes a cross-module boundary violation — it must instead emit and let
  billing subscribe.

### 1.5 Cron / BullMQ / workers

| Job | Schedule | File | Queue |
|---|---|---|---|
| `legacy-dunning-campaigns` | `0 */6 * * *` | `lib/core/legacyBridge.ts` → `operationalQueues.processDunningCampaigns()` | `dunning-management` |
| `dunning-management` worker | — | `lib/jobs/JobProcessor.ts` | `dunning-management` (BullMQ) |
| `DunningManager.executeDunningAttempt` | on-demand | `lib/subscription/DunningManager.ts` (**not** under `lib/dunning/`) | n/a |

Note: `DunningManager` actually lives under `lib/subscription/` but its schema
(`dunning_attempts`) and semantics belong to billing. Resolution below in §3 +
§1.8 feature sketch.

### 1.6 Frontend consumers (apps/web)

- `hooks/useInvoices.ts` — `trpc.invoices.getAll`, `.getStats`, `.generatePDF`.
- `hooks/useClientData.ts` — `trpc.invoices.getByClient`, `.processPayment`,
  `.confirmPayment`.
- `pages/admin/AdminInvoices.tsx` — list + stats UI.
- `pages/admin/AdminBilling.tsx` — dashboard (also uses `paymentGateways.*`).
- `pages/store/CheckoutPage.tsx` — `trpc.invoices.createInvoice` (legacy name).
- `components/client/InvoiceDetails.tsx` — `trpc.invoices.generatePDF`.
- `components/admin/CreateInvoiceModal.tsx` — `trpc.invoices.create`.

### 1.7 Risk flags

- **Secrets**: Nodemailer transport built ad-hoc from env (`InvoiceEmailService`,
  `DunningEmailService`). ➜ swap to `ctx.email` (core email factory). No keys
  at rest.
- **External APIs**: Stripe is reached **indirectly** via `PaymentService`, not
  directly from billing.
- **God file**: `routers/invoices.ts` = 719 LOC (largest in Phase 3.2).
- **PDF coupling**: `InvoicePDFService` hardcodes tenant metadata shape and joins
  4 tables (clients, users, tenants, invoiceItems) — needs `tenants` service
  helper or duplicated read via core.

### 1.8 Feature-breakdown sketch (6 worker features, each ≤ 1 day)

1. **billing-schema-freeze** — finish `modules/billing/src/schema.ts` (already
   stubbed): drop relations to `subscriptions`/`payments`, keep intra-module
   relations (invoice↔items), add `dunning_attempts` + `invoice_counters`. Write
   Drizzle migration (`billing_*` prefix or kept for FK compatibility during
   dual-ownership).
2. **billing-invoice-service** — port `InvoiceNumberService`,
   `InvoicePDFService`, `TaxCalculationService`, `ComponentInvoiceService` into
   `BillingService` (already scaffolded in `modules/billing/src/service.ts` at
   560 LOC). Stop using legacy `EventService`; replace with `ctx.emit`.
3. **billing-hono-routes** — flesh out `routes.ts` (already 480 LOC) to cover
   all 9 procedures via `@hono/zod-openapi`. Add `GET /invoices/:id/pdf` as
   streaming download (not base64). Mount `/api/billing`.
4. **billing-dunning-port** — move `DunningManager` + `DunningEmailService` +
   strategy library into module; register `billing-dunning-sweep` job
   (`ctx.job`). Subscribe to `subscription.past_due` to start a campaign.
5. **billing-events-and-jobs** — emit `invoice.{created,sent,paid,overdue,
   cancelled,refunded}`; subscribe to `payment.succeeded` (mark paid), to
   `subscription.renewed` (generate recurring invoice — currently in
   `SubscriptionService`). Register cron `billing-generate-recurring-invoices`
   (daily 1am) and `billing-send-overdue-reminders` (daily 9am) — the module
   definition already declares these.
6. **billing-frontend-rewire + legacy-delete** — add `apps/web/src/api/billingApi.ts`;
   rewrite all `trpc.invoices.*` callsites listed in §1.6 to REST. Delete
   `apps/api/src/routers/invoices.ts`, `lib/invoice/`, `lib/dunning/`, remove
   `invoices` key from `routers/index.ts`. Delete `legacy-dunning-campaigns`
   cron from `legacyBridge.ts`. Re-run existing tests (none for invoices, so
   this is mostly type-check + smoke).

### 1.9 Target module events

**Emits**: `invoice.created`, `invoice.sent`, `invoice.paid`,
`invoice.overdue`, `invoice.cancelled`, `invoice.refunded`, `dunning.attempted`,
`dunning.campaign.started` (already declared in `modules/billing/src/index.ts`).

**Subscribes**: `payment.succeeded` (mark invoice paid + kick provisioning via
downstream subscriptions), `payment.failed` (bump invoice status + seed dunning),
`subscription.renewed` (create recurring invoice),
`subscription.past_due` (start dunning campaign).

### 1.10 TODOs / dead code

- `lib/invoice/InvoiceEventHandler.ts` ➜ replace `console.log`/`console.error`
  with `ctx.logger`; the `ENABLE_EMAIL_SENDING` env gate is legacy.
- `TaxCalculationService.ts` ➜ single source of truth for country/state tables
  duplicated across file; replace with JSON lookup.
- `InvoicePDFService.ts` ➜ `invoice.status === 'PAID' ? paidAt` path is fine,
  but `tenant.settings` vs `tenant.metadata` confusion (SubscriptionService uses
  `tenant.metadata`). Pick one.
- `routers/invoices.ts` ➜ many `console.error` calls; use `ctx.logger`. `status`
  enum in router includes `OVERDUE` while schema enum has `OVERDUE` — fine, but
  `getAll` input allows only 4 states. Harmonise.

---

## 2. Payments Domain (Phase 3.3 — `modules/payments/`)

### 2.1 File inventory

| Path | LOC | Purpose |
|---|---:|---|
| `lib/payments/index.ts` | 9 | Barrel. |
| `lib/payments/PaymentService.ts` | 320 | Singleton facade: `processRefund`, `getBestGateway`, `updatePaymentStatus`, `handleWebhook`. Emits `payment.succeeded|failed`. |
| `lib/payments/PaymentGatewayService.ts` | 111 | CRUD + encrypt/decrypt of `paymentGatewayConfigs.config`. |
| `lib/payments/PaymentEventHandler.ts` | 314 | Subscribes on core `EventBus` to `payment.succeeded|failed`; marks invoice PAID and handles subscription activation/renewal. Cross-module DB writes today. |
| `lib/payments/core/PaymentGatewayManager.ts` | 351 | Registry + per-tenant config cache, `registerGateway`, `getBestGateway` (currency+country filter), `configureGateway`, `testGatewayConfig`, `getGatewayStats` (joins `payments`). |
| `lib/payments/gateways/StripeGateway.ts` | 501 | Full `PaymentGateway` impl: intents, confirm, capture, refund, webhook verify + dispatch, customer+pm+subscription helpers. Uses `stripe` SDK. |
| `lib/payments/interfaces/PaymentGateway.ts` | 331 | Interface: `PaymentGateway`, `PaymentIntent*`, `PaymentResult`, `RefundParams`, `WebhookResult`, `Capabilities`, `PaymentContext`. **To be replaced by `@panel1/types/extensions.IPaymentGateway`.** |
| `routers/payment-gateways.ts` | 232 | tRPC router — 6 procedures. |
| **Total payments LOC** | **2,169** | — |
| Tests | **0** | No payments tests today. |

### 2.2 Public tRPC surface (`paymentGatewaysRouter`, 6 procedures)

| Procedure | Kind | In → Out |
|---|---|---|
| `getAll` | query | `{search?,status?,type?}` → `{gateways:[{…,stats,health}]}` |
| `getTransactions` | query | `{limit,offset,gatewayId?,status?}` → `{transactions[]}` |
| `create` | mutation | `{displayName,gatewayName,config,isDefault}` → `PaymentGatewayConfig` |
| `update` | mutation | `{id,displayName?,config?,isDefault?,status?}` → `PaymentGatewayConfig` |
| `delete` | mutation | `{id}` → `{success:true}` |
| `testConnection` | mutation | `{id}` → `{success,message,responseTime}` (**stubbed**) |

Note: payment _processing_ procedures live under `invoicesRouter.processPayment`
/ `confirmPayment` today, which is an architectural smell — they should be part
of the payments module.

### 2.3 Schema

| Table | Key columns | Cross-module FKs |
|---|---|---|
| `payments` | id, amount, currency, status enum (10 values), gateway, gatewayId, gatewayPaymentId, gatewayResponse JSONB, refundedAmount, refundStatus, retryCount, nextRetryAt | `tenant_id`, `client_id`, `invoice_id` (billing!), `subscription_id` (subscriptions!) |
| `payment_attempts` | id, paymentId, gatewayName, attemptNumber, status, processingTimeMs, errorMessage, gatewayResponse | `payment_id → payments.id` |
| `payment_gateway_configs` | id, gatewayName, displayName, status enum, isActive/Default, config (JSONB, **encrypted**), publicConfig, supportedCurrencies, supportedPaymentMethods, features, webhookUrl/Secret, apiEndpoint, lastHealthCheck | `tenant_id` |

⚠ `payment-gateways.ts` **also** declares a duplicate `paymentAttempts` table —
the Drizzle barrel would double-register if not for the `import` cycle. Clean
up during migration.

### 2.4 Cross-domain coupling

- `PaymentEventHandler.ts` writes to `invoices`, `subscriptions`, `plans` via
  `db.update/select` → **cross-module**. Must be replaced with events:
  emit `payment.succeeded` and let billing + subscriptions react in their own
  modules.
- `StripeGateway.ts` emits `payment.succeeded` / `payment.failed` via
  `EventService.getInstance()` → needs to route through `ctx.emit`.
- `PaymentService.updatePaymentStatus` also emits `payment.succeeded|failed`.
  Dual emission risk — consolidate.
- `routers/invoices.ts` dynamically imports `PaymentService` → replace with
  service registry.

### 2.5 Cron / BullMQ / workers

| Job | Schedule | File | Queue |
|---|---|---|---|
| `legacy-hourly-failed-payments` | `0 * * * *` | `lib/core/legacyBridge.ts` → `operationalQueues.processFailedPayments()` | `payment-retry` |
| `payment-retry` worker | — | `lib/jobs/JobProcessor.ts` (TODO-stubbed body) | `payment-retry` (BullMQ) |

### 2.6 Frontend consumers

- `pages/admin/AdminPaymentGateways.tsx` — `trpc.paymentGateways.getAll`, `.getStats` (**`getStats` not defined in router — dead call**), `.create`, `.update`, `.delete`, `.testConnection`.
- `pages/admin/AdminBilling.tsx` — `trpc.paymentGateways.getTransactions`, `.getAll`.

### 2.7 Risk flags

- **Secrets** (HIGH): `paymentGatewayConfigs.config` stores Stripe `secretKey` +
  `webhookSecret`, encrypted with `EncryptionService`. Migration must preserve
  ciphertext on-disk (use `ctx.encryption` factory → same AES-GCM).
- **External APIs**: Stripe (live traffic). Webhook handler in
  `PaymentService.handleWebhook` — must survive migration, including signature
  verification.
- **Gateways map to `@panel1/types.IPaymentGateway`** but interface drift: local
  `PaymentGateway` includes `capabilities` + `supportedCountries`, which the
  framework interface doesn't yet require. Decide: extend framework interface
  or adapt.
- **Singletons in module**: `PaymentService.instance`, `PaymentGatewayManager`
  — replace with `ctx`-injected instances.

### 2.8 Feature-breakdown sketch (5 worker features)

1. **payments-gateway-contract** — align `modules/payments/src/types.ts` with
   `@panel1/types.IPaymentGateway`; extend framework interface if needed.
   Port `StripeGateway` (501 LOC) into the module; keep webhook signature
   verification intact.
2. **payments-service** — consolidate `PaymentService` + `PaymentGatewayService`
   + `PaymentGatewayManager` into single `PaymentService` class exposing
   `IPaymentService`: `createIntent`, `confirm`, `refund`, `handleWebhook`,
   `getAvailableGateways`, `configureGateway`, `testGateway`. Module-scoped DB
   via `ctx.db`. Use `ctx.encryption`. Already partly scaffolded at
   `modules/payments/src/service.ts` (820 LOC).
3. **payments-hono-routes** — 6 procedures from `payment-gateways.ts` + the 2
   processing procedures currently in `invoicesRouter`
   (`processPayment`/`confirmPayment`) move to `/api/payments/*`. Add webhook
   endpoint `POST /api/payments/webhooks/:gateway` (currently only exists
   through tRPC path inside `PaymentService.handleWebhook`, which has no HTTP
   binding).
4. **payments-events-and-jobs** — emit `payment.{initiated,succeeded,failed,
   refunded}`; register hourly `payments-retry-failed` job replacing
   `legacy-hourly-failed-payments`; **delete** cross-module
   `PaymentEventHandler` — billing + subscriptions subscribe instead.
5. **payments-frontend-rewire + legacy-delete** — add
   `apps/web/src/api/paymentsApi.ts`, rewire `AdminPaymentGateways`,
   `AdminBilling`. Delete `apps/api/src/lib/payments/`, `routers/payment-gateways.ts`,
   remove `paymentGateways` key from `routers/index.ts`.

### 2.9 Target events

**Emits**: `payment.initiated`, `payment.succeeded`, `payment.failed`,
`payment.refunded` (already declared in module `emits`).
**Subscribes**: `invoice.sent` (optional: send payment link email).

### 2.10 TODOs / dead code

- `PaymentEventHandler.ts` line ~200: `// TODO: Implement retry logic, dunning management, etc.` — now owned by billing.
- `PaymentService.registerGateways` has `// TODO: Register other gateways`.
- `PaymentGatewayManager.getBestGateway` has `// TODO: Implement smart selection`.
- `JobProcessor.registerPaymentRetryProcessor` body is entirely TODO — delete in
  favour of a typed processor.
- `payment-gateways.ts` `testConnection` is stubbed (`Math.random()` response
  time) — implement via `gateway.healthCheck()`.
- `AdminPaymentGateways.tsx` calls `getStats` that doesn't exist on the router
  — dead code.
- Duplicate `paymentAttempts` declaration across `payments.ts` and
  `payment-gateways.ts` schema files.

---

## 3. Subscriptions Domain (Phase 3.4 — `modules/subscriptions/`)

### 3.1 File inventory

| Path | LOC | Purpose |
|---|---:|---|
| `lib/subscription/SubscriptionService.ts` | 1,027 | **God class** (see §3.7). State machine, creation, renewal, cancellation, proration, refund, state-change log, event emit. |
| `lib/subscription/DunningManager.ts` | 429 | Strategy definitions (`default|gentle|aggressive`) + scheduling + execution (email/grace/suspend/cancel). Writes `dunning_attempts`. Belongs to **billing** per roadmap but currently under subscription. |
| `lib/jobs/processors/SubscriptionRenewalProcessor.ts` | 315 | Static BullMQ worker body — duplicates most of `SubscriptionService.processRenewal`. |
| `lib/jobs/processors/ProvisioningProcessor.ts` | 28 | Thin provisioning job dispatcher. |
| `routers/subscriptions.ts` | 558 | tRPC router — 18 procedures. |
| **Total subscriptions LOC** | **2,357** | — |
| Tests | **0** | No subscription tests today. |

### 3.2 Public tRPC surface (`subscriptionsRouter`, 18 procedures)

`create`, `getById`, `getByClient`, `list`, `cancel`, `cancelByClient`,
`triggerRenewal`, `calculateProration`, `getStateChanges`,
`startDunningCampaign`, `getDunningAttempts`, `getDunningStrategies`,
`getJobStats`, `scheduleRenewalCheck`, `processFailedPayments`,
`processDunningCampaigns`, `updateStatus`, `getMetrics`.

Notes:
- `getJobStats` / `scheduleRenewalCheck` / `processFailedPayments` /
  `processDunningCampaigns` are **admin ops** — they duplicate what should be
  visible via `core.JobScheduler.runNow()` + `getStats()`.
- `cancelByClient` uses `protectedProcedure` and role checks `CLIENT`; the rest
  use `adminProcedure` (not `requirePermission`). Align with canonical RBAC
  during migration.

### 3.3 Schema

| Table | Key columns | Cross-module FKs |
|---|---|---|
| `subscriptions` | id, status enum (8 values), currentPeriodStart/End, nextBillingDate, cancelAtPeriodEnd, trial{Start,End}, pastDueDate, suspendedAt, failedPaymentAttempts, unitPrice, paymentMethodId, defaultPaymentMethod JSONB, metadata | `client_id → clients.id (cascade)`, `plan_id → plans.id` (**catalog**), `tenant_id` |
| `subscription_components` | id, subscriptionId, componentId (ref catalog), name/desc, quantity, unitPrice, metadata, provisioningStatus | `subscription_id → subscriptions.id (cascade)`, componentId is **catalog** (not FK'd at DB level) |
| `subscription_state_changes` | id, subscriptionId, fromStatus, toStatus, reason, metadata, userId | `subscription_id → subscriptions.id`, `user_id → users.id`, `tenant_id` |

Note: legacy `lib/subscription/SubscriptionService` also reads
`subscribedComponents` / `components` / `productComponents` / `products` —
those tables now live in **modules/catalog**. The cross-module reads must go
through `ctx.service<ICatalogService>('catalog')`.

### 3.4 Cross-domain coupling

- `SubscriptionService` imports `lib/payments/PaymentService` (dynamic),
  `lib/invoice/InvoiceNumberService`, `lib/invoice/TaxCalculationService`. All
  become `ctx.service(...)` calls.
- Direct DB writes to `invoices` + `payments` during renewal — must move to
  `billing.createRecurringInvoice` + `payments.createIntent` calls.
- `SubscriptionRenewalProcessor` duplicates the same path.
- **Emits (17 unique)**: `subscription.activated`, `subscription.renewal_started`,
  `subscription.renewal_failed`, `subscription.renewed`, `subscription.terminated`,
  `subscription.past_due`, `subscription.suspended`, `subscription.unsuspended`,
  `payment.retry_needed` (mis-namespaced — belongs to payments).

### 3.5 Cron / BullMQ / workers

| Job | Schedule | File | Queue |
|---|---|---|---|
| `legacy-daily-subscription-renewals` | `0 1 * * *` | `legacyBridge.ts` → `operationalQueues.scheduleSubscriptionRenewals()` | `subscription-renewal` |
| `subscription-renewal` worker | — | `lib/jobs/JobProcessor.ts` + `processors/SubscriptionRenewalProcessor.ts` | BullMQ |

### 3.6 Frontend consumers

- `hooks/useClientData.ts` — `trpc.subscriptions.cancelByClient`, `.getByClient`.
- `pages/admin/AdminSubscriptions.tsx` — `trpc.subscriptions.list`.
- `pages/store/CheckoutPage.tsx` — `trpc.subscriptions.createSubscription`.

### 3.7 Risk flags

- **God class**: `SubscriptionService.ts` = 1,027 LOC. Mixes state machine,
  renewal, cancellation, proration, refund, event emit, and direct DB writes to
  3 domains (subs, invoices, payments). Must be decomposed during port.
- **State machine duplication**: renewal logic lives in both
  `SubscriptionService.processRenewal` *and*
  `SubscriptionRenewalProcessor.process` — keep one.
- **Event reentrancy**: `PaymentEventHandler` reacts to `payment.succeeded` and
  calls `eventService.emit('subscription.activated', …)` — after the move, both
  modules emit the same event, risking double-processing. Decide ownership:
  subscriptions must be the only emitter of `subscription.*`.
- **No external APIs directly** — all go through payments.
- **Misuse of `db.$count()`** in `getMetrics` — not a real Drizzle helper, code
  likely fails at runtime.

### 3.8 Feature-breakdown sketch (6 worker features)

1. **subscriptions-scaffold** — `modules/subscriptions/src/{index,types,schema,service,routes,seed-permissions}.ts`. Depend on `['catalog','billing','payments']`.
2. **subscriptions-service-core** — port creation, state machine,
   cancellation, proration, state-change log from `SubscriptionService` with
   DB writes scoped to 3 module-owned tables only. Use `ctx.service` for
   cross-calls.
3. **subscriptions-renewal-pipeline** — collapse the two renewal code paths
   into a single `processRenewal` called by `ctx.job('subscriptions-renewal-sweep', '0 1 * * *', …)` and by admin `POST /:id/renew`. Delegate invoice creation to billing, payment to payments.
4. **subscriptions-hono-routes** — 12 retained + 4 deprecated (drop the 4
   admin `getJobStats / schedule* / process*` procedures — use core job
   manager UI in Phase 5). Gate with `subscriptions.subscriptions.{view,manage}`.
5. **subscriptions-events-rewire** — emit `subscription.{created,activated,
   renewed,renewal_failed,cancelled,past_due,suspended,unsuspended,trial_ending}`. Subscribe to `payment.succeeded` (activate/renew) and
   `payment.failed` (past_due). Drop the parallel listeners currently inside
   `PaymentEventHandler`.
6. **subscriptions-frontend-rewire + legacy-delete** — `apps/web/src/api/subscriptionsApi.ts`, rewire `AdminSubscriptions`, `ClientPortal`, `CheckoutPage`. Delete `apps/api/src/lib/subscription/`, `routers/subscriptions.ts`, `lib/jobs/processors/SubscriptionRenewalProcessor.ts`, the legacy `subscription-renewal` queue registration, and `legacy-daily-subscription-renewals` cron bridge entry.

### 3.9 Target events

**Emits**: `subscription.created`, `subscription.activated`,
`subscription.renewed`, `subscription.renewal_started`, `subscription.renewal_failed`,
`subscription.cancelled`, `subscription.terminated`, `subscription.past_due`,
`subscription.suspended`, `subscription.unsuspended`, `subscription.trial_ending`.

**Subscribes**: `payment.succeeded`, `payment.failed`, `payment.refunded`,
`provisioning.failed` (optional: suspend subscription on provisioning failure),
`catalog.plan.updated` (invalidate in-flight renewal prices — optional).

### 3.10 TODOs / dead code

- `DunningManager` comment: `attemptNumber: 1, // TODO: Implement proper attempt numbering`.
- Renewal path duplicated between `SubscriptionService` and
  `SubscriptionRenewalProcessor` — drop the latter.
- `getMetrics` uses `db.$count()` — broken.
- All `console.*` calls must become `ctx.logger`.

---

## 4. Provisioning Domain (Phase 3.5 — `modules/provisioning/`)

### 4.1 File inventory

| Path | LOC | Purpose |
|---|---:|---|
| `lib/provisioning/ProvisioningManager.ts` | 544 | Central orchestrator: plugin registry, provider CRUD, provision/suspend/unsuspend/terminate dispatch via BullMQ, adapter cache, health check, encrypt creds. |
| `lib/provisioning/types.ts` | 262 | Local interfaces (`IProvisioner`-equivalent + `ProvisioningJobData`, errors, events). **Must map to `@panel1/types.IProvisioner`.** |
| `lib/provisioning/adapters/CpanelAdapter.ts` | 193 | Thin cPanel adapter (used by CpanelPlugin). |
| `lib/provisioning/plugins/CpanelPlugin.ts` | 304 | First-party cPanel plugin — implements adapter factory + config schema. |
| `lib/jobs/processors/ProvisioningProcessor.ts` | 28 | Calls `provisioningManager.processProvisioningJob(taskId)`. |
| `routers/provisioning.ts` | 552 | tRPC router — 12 procedures. |
| **Total provisioning LOC** | **1,883** | — |
| Tests | **0** | None today. |

### 4.2 Public tRPC surface (12 procedures)

`createProvider`, `listProviders`, `getProvider`, `testProvider`,
`createServiceInstance`, `listServiceInstances`, `getServiceInstance`,
`suspendService`, `unsuspendService`, `terminateService`,
`getProvisioningTasks`, `getTask`.

### 4.3 Schema

| Table | Key columns | Cross-module FKs |
|---|---|---|
| `provisioning_providers` | id, name, type enum (7), hostname, port, username, apiKey (encrypted), apiSecret (encrypted), useSSL, verifySSL, config (JSONB, contains encrypted secrets), limits, isActive, lastHealthCheck, healthStatus | `tenant_id` |
| `service_instances` | id, subscriptionId, providerId, serviceName, serviceType, remoteId, remoteData JSONB, controlPanelUrl, username, password (encrypted), quotas (disk/bw/email/db/sub), status, lastSync | `subscription_id → subscriptions.id (cascade)`, `provider_id → provisioning_providers.id`, `tenant_id` |
| `provisioning_tasks` | id, serviceInstanceId, providerId, operation enum (8), status enum (6), requestData JSONB, responseData JSONB, started/completed/attemptNumber/maxAttempts, errorMessage, jobId | `service_instance_id → service_instances.id`, `provider_id → provisioning_providers.id`, `tenant_id` |

### 4.4 Cross-domain coupling

- Reads `subscriptions` during `createServiceInstance` → service call to
  `ISubscriptionService.getById`.
- No direct DB writes into other modules.
- `EventEmitter` (Node) used for in-process events (`task.completed`,
  `task.failed`) — should be routed through `ctx.emit` as
  `provisioning.{started,completed,failed}`.

### 4.5 Cron / BullMQ / workers

- 7 Bull queues created eagerly by `OperationalQueues.initialize()`:
  `provisioning-provision`, `-suspend`, `-unsuspend`, `-terminate`, `-modify`,
  `-sync`, `-health-check`. Workers are only wired for provision/suspend/etc.
  via `ProvisioningProcessor` (no single registration — dispatches based on
  `operation`).
- No crons yet for `provisioning-sync` or `provisioning-health-check` despite
  queues existing — dead scaffolding.

### 4.6 Frontend consumers

- `pages/admin/AdminProvisioning.tsx` — `trpc.provisioning.getServers`,
  `.getJobs` (**neither exists on current router** — UI is broken).

### 4.7 Risk flags

- **Secrets** (HIGH): `apiKey`, `apiSecret`, `config.password`, `config.secret`,
  `service_instances.password` — all encrypted with `EncryptionService`. Must
  preserve keys during migration.
- **External APIs**: cPanel/WHM (over HTTPS), XML-RPC/JSON; adapter supports
  `useSSL` / `verifySSL` toggles.
- **Interface drift**: local `ProvisioningAdapter` differs from
  `@panel1/types.IProvisioner` (e.g. no `changePackage`, has separate `modify`).
- **Plugin ↔ Module**: roadmap says cPanel lives as a **plugin** (plugin
  boundary). Decide: keep `CpanelPlugin` in module for v0 or extract to
  `plugins/cpanel/` right away.
- Frontend broken calls (`getServers`, `getJobs`) — ship or delete.

### 4.8 Feature-breakdown sketch (5 worker features)

1. **provisioning-contract** — align `types.ts` with `@panel1/types.IProvisioner`; decide plugin vs built-in for cPanel.
2. **provisioning-scaffold** — module skeleton, schema port, `service.ts` with
   `provision/suspend/unsuspend/terminate/healthCheck` calling IProvisioner
   adapter; keep encrypted credential handling via `ctx.encryption`.
3. **provisioning-hono-routes** — 12 procedures → `/api/provisioning/*`.
4. **provisioning-jobs-and-events** — use `ctx.job` for
   `provisioning-sync-health` (every 10 min) + per-op fan-out; emit
   `provisioning.{started,completed,failed,suspended,terminated}`. Subscribe to
   `subscription.activated` → auto-provision; `subscription.cancelled` → terminate.
5. **provisioning-frontend-fix + legacy-delete** — rewrite
   `AdminProvisioning` against `listProviders/listServiceInstances/getProvisioningTasks`; delete `apps/api/src/lib/provisioning/`,
   `routers/provisioning.ts`, `lib/jobs/processors/ProvisioningProcessor.ts`;
   retire the 7 queue names from `OperationalQueues.initialize()` (BullMQ
   queues become module-owned).

### 4.9 Target events

**Emits**: `provisioning.started`, `provisioning.completed`,
`provisioning.failed`, `provisioning.suspended`, `provisioning.unsuspended`,
`provisioning.terminated`, `provisioning.sync.completed`.
**Subscribes**: `subscription.activated`, `subscription.cancelled`,
`subscription.suspended`.

### 4.10 TODOs / dead code

- `ProvisioningManager.loadPlugins` TODO lists `PleskPlugin`, `DockerPlugin`.
- `provisioning-sync` / `provisioning-health-check` queues created without
  workers.
- `DomainPlugin` registers a `domain-manager` ComponentHandler into
  `ComponentLifecycleService` — needs to route to provisioning/domains module
  service after catalog finishes its schema port (issue 3.6).

---

## 5. Domains Domain (Phase 4.1 — `modules/domains/`)

### 5.1 File inventory

| Path | LOC | Purpose |
|---|---:|---|
| `lib/domains/DomainManager.ts` | 617 | EventEmitter-based manager: register/renew/disable-auto-renew, DNS zones/records CRUD, suspend/unsuspend, backup-records pattern. |
| `lib/domains/DomainComponentHandler.ts` | 233 | Glue between component lifecycle and `DomainManager`. |
| `lib/domains/registrars/NamecheapRegistrar.ts` | 609 | XML API client (sandbox + live URLs) — register/renew/transfer/nameservers. |
| `lib/plugins/domain/DomainPlugin.ts` | 707 | BasePlugin + `getRouter()` with 9 tRPC procedures + `ComponentHandler` + `setInterval` for renewal checks. |
| `lib/plugins/domain/plugin.json` | n/a | Plugin manifest. |
| **Total domains LOC** | **2,166** | — |
| Tests | **0** | None today. |

### 5.2 Public tRPC surface (9 procedures, via `DomainPlugin.getRouter()`)

`registerDomain`, `renewDomain`, `updateNameservers`, `listDomains`,
`getDnsZones`, `createDnsRecord`, `updateDnsRecord`, `deleteDnsRecord`,
`getDnsRecords`.

Mounted as `domains` key in root router via `PluginManager` — will be deleted
along with the plugin system.

### 5.3 Schema

| Table | Key columns | Cross-module FKs |
|---|---|---|
| `domains` | id, domainName (unique), registrar, registrarDomainId, registeredAt, expiresAt, autoRenew, renewalPeriod, status enum (6), nameservers[], 4× contact JSONB, privacyEnabled, authCode, transferLock, costs | `client_id → clients.id (cascade)`, `subscription_id → subscriptions.id (set null)`, `tenant_id` |
| `dns_zones` | id, domainId, zoneName, soaRecord JSONB, isActive | `domain_id → domains.id (cascade)`, `tenant_id` |
| `dns_records` | id, zoneId, name, type enum (9), value, ttl, priority, isActive | `zone_id → dns_zones.id (cascade)`, `tenant_id` |
| `domain_operations` | id, domainId, operation enum (7), status, request/responseData JSONB, errorMessage | `domain_id → domains.id (cascade)`, `tenant_id` |

⚠ `DomainManager.suspendDomain` expects `backupRecords` + `status` columns on
`dns_zones` that don't exist in the schema file — either a stale method or an
unmigrated column. Confirm before porting.

### 5.4 Cross-domain coupling

- Reads `subscribed_components` (catalog) in `DomainComponentHandler`.
- Writes back to `domains` only. No cross-writes.
- Uses internal `EventEmitter`, no `EventService` calls.

### 5.5 Cron / BullMQ / workers

- `DomainPlugin.startRenewalChecks` = raw `setInterval` (default 12h) — **not
  BullMQ**. Must become `ctx.job('domains-renewal-check', '0 */12 * * *', …)`.
- `DomainManager.scheduleDomainOperation` is a TODO-stubbed no-op despite being
  called from `registerDomain`, `updateNameservers`, etc.

### 5.6 Frontend consumers

- `pages/admin/AdminDomains.tsx` — `trpc.domains?.listDomains`, `trpc.domains?.getDnsRecords` (optional chained — the plugin mount is
  conditional).

### 5.7 Risk flags

- **External APIs**: Namecheap (XML, both sandbox + live endpoints).
- **Secrets**: `NamecheapConfig.apiKey` passed plain through constructor — no
  encryption in this path. Fix during port.
- **Contract drift**: `DomainManager.registerDomain` is called from
  `DomainPlugin.getRouter().registerDomain` with one shape, and from
  `DomainComponentHandler.provision` with a DIFFERENT shape (`domain`/`registrarId`/`years` vs `domainName`/`registrar`/`registrantContact` etc.).
  One call site is broken.
- **Dead code**: `suspendDomain`/`unsuspendDomain` in manager reference schema
  columns (`backupRecords`, `dnsZones.status`) that don't exist.
- **Plugin-system dependency**: `DomainPlugin extends BasePlugin`
  (`lib/plugins/BasePlugin.ts`). The old plugin system is slated for deletion in
  Phase 5 — can't port the plugin wholesale; extract the router and manager
  code into `modules/domains`.

### 5.8 Feature-breakdown sketch (5 worker features)

1. **domains-registrar-contract** — align with `@panel1/types.IRegistrar`; add
   `NamecheapRegistrar` to module as first built-in.
2. **domains-scaffold + schema-port** — `modules/domains/src/*`; reconcile the
   `backupRecords` / `dns_zones.status` drift with a migration.
3. **domains-service-and-routes** — port `DomainManager` → `DomainService`; 9
   tRPC procedures → Hono under `/api/domains/*`. Route
   `DomainComponentHandler` usage through `ctx.service('domains')`.
4. **domains-jobs-and-events** — replace `setInterval` renewal with
   `ctx.job('domains-expiry-scan', '0 */12 * * *', …)`. Emit
   `domain.{registered,renewed,expiring,suspended,transferred,nameservers_updated}`.
5. **domains-frontend-rewire + legacy-delete** — `domainsApi.ts`, rewire
   `AdminDomains.tsx`. Delete `apps/api/src/lib/domains/`, `lib/plugins/domain/`.

### 5.9 Target events

**Emits**: `domain.registered`, `domain.renewed`, `domain.expiring`,
`domain.suspended`, `domain.unsuspended`, `domain.transferred`,
`domain.nameservers_updated`, `domain.dns_changed`.
**Subscribes**: `subscription.cancelled` (disable auto-renew),
`subscription.activated` (trigger component provisioning).

### 5.10 TODOs / dead code

- `DomainManager.scheduleDomainOperation` TODO.
- `getDomainsExpiringWithin` has `// TODO: Add proper date filtering`.
- `DomainComponentHandler.provision` signature mismatch (see §5.7).
- `lib/plugins/BasePlugin.ts` dependency — drop.

---

## 6. SSL Domain (Phase 4.2 — `modules/ssl/`)

### 6.1 File inventory

| Path | LOC | Purpose |
|---|---:|---|
| `lib/ssl/SslCertificateManager.ts` | 396 | Issue/renew/install/revoke; Let's Encrypt + commercial provider stubs; validation records; op log. |
| `lib/ssl/SslComponentHandler.ts` | 229 | Glue to `subscribed_components`. |
| `lib/plugins/ssl/SslPlugin.ts` | 535 | BasePlugin + `getRouter()` with 6 tRPC procedures + renewal monitoring. |
| `lib/plugins/ssl/plugin.json` | n/a | Plugin manifest. |
| **Total SSL LOC** | **1,160** | — |
| Tests | **0** | None today. |

### 6.2 Public tRPC surface (6 procedures)

`issueCertificate`, `renewCertificate`, `revokeCertificate`, `listCertificates`,
`createValidationRecord`, `validateDomain`.

### 6.3 Schema

| Table | Key columns | Cross-module FKs |
|---|---|---|
| `ssl_certificates` | id, certificateName, type enum (5), provider enum (7), primaryDomain, domains[], wildcardDomains[], certificate/privateKey/certificateChain/csr (PEM, private key encrypted), providerCertificateId/OrderId, validationMethod, issuedAt, expiresAt, autoRenew, renewalBuffer, status enum (6), installations[], costs | `client_id → clients.id (cascade)`, `domain_id → domains.id (set null)` (**cross-module**), `service_instance_id → service_instances.id (set null)` (**cross-module**), `tenant_id` |
| `ssl_certificate_operations` | id, certificateId, operation enum (6), status, request/responseData, errors | `certificate_id → ssl_certificates.id (cascade)`, `tenant_id` |
| `ssl_validation_records` | id, certificateId, domain, method, recordName/Value/Type, httpPath/Content, validationEmail, isValidated, validatedAt, expiresAt | `certificate_id → ssl_certificates.id (cascade)`, `tenant_id` |

### 6.4 Cross-domain coupling

- FKs into `domains.id` and `service_instances.id` — resolve via service calls
  at application level (do not drop FKs at DB level while single DB, but modules
  must not `import` those tables).
- Reads `subscribedComponents` (catalog) in `SslComponentHandler`.
- `SslCertificateManager.installCertificate` is called with
  `serviceInstanceId` — must route through `ctx.service('provisioning').installSslCertificate(...)`.

### 6.5 Cron / BullMQ / workers

- `SslPlugin.startRenewalMonitoring` is a stub (no scheduling wired).

### 6.6 Frontend consumers

- `pages/admin/AdminSSL.tsx` — `trpc.ssl.getAll` (**not in router**, router
  exposes `listCertificates`) — UI broken.

### 6.7 Risk flags

- **Secrets** (HIGH): `privateKey` stored in DB — encrypt at rest via
  `ctx.encryption` (the current code comments say "encrypted" but no
  encryption path wired on insert).
- **External APIs**: Let's Encrypt (ACME), Sectigo/DigiCert/GlobalSign/GoDaddy/
  Namecheap (placeholders only).
- **Contract**: not yet defined at `@panel1/types` level — add `ISslProvider`.
- `SslComponentHandler.provision` calls `sslManager.issueCertificate` with a
  shape that doesn't match `SslCertificateRequest` (missing `domains`,
  `primaryDomain`, `clientId`). Broken path.
- UI → router mismatch (`getAll` vs `listCertificates`).

### 6.8 Feature-breakdown sketch (5 worker features)

1. **ssl-contract** — add `ISslProvider` to `@panel1/types`; module declares
   `emits` + `permissions`.
2. **ssl-scaffold + schema-port** — `modules/ssl/src/*`; preserve FKs to domains
   & service_instances at DB level (until Phase 3.6 policy lands); encrypt
   `privateKey` on insert.
3. **ssl-service-and-routes** — 6 tRPC procedures → Hono under `/api/ssl/*`;
   port `SslCertificateManager`; add `installCertificate` routing through
   provisioning service.
4. **ssl-jobs-and-events** — `ctx.job('ssl-renewal-scan', '0 2 * * *', …)`;
   emit `ssl.{issued,renewed,revoked,expiring,installed,validation_failed}`.
   Subscribe to `domain.registered` (auto-issue for DV).
5. **ssl-frontend-fix + legacy-delete** — `sslApi.ts`; rewire `AdminSSL.tsx` to
   use `listCertificates`. Delete `apps/api/src/lib/ssl/`, `lib/plugins/ssl/`.

### 6.9 Target events

**Emits**: `ssl.issued`, `ssl.renewed`, `ssl.revoked`, `ssl.expiring`,
`ssl.installed`, `ssl.validation_failed`.
**Subscribes**: `domain.registered` (auto-issue LE for DV),
`domain.nameservers_updated` (revalidate DNS challenge),
`provisioning.completed` (auto-install onto new service instance).

### 6.10 TODOs / dead code

- `SslPlugin.startRenewalMonitoring` body is a comment only.
- Commercial provider branches (`processCommercialCertificate`) are placeholders.
- `privateKey` insert path doesn't call `encryptionService.encrypt` despite
  comment.
- `AdminSSL.tsx` → broken `getAll` call.

---

## 7. Aggregate Totals (excluding already-migrated catalog/support/audit)

| Domain | LOC (lib + router) | Procedures | Tables |
|---|---:|---:|---:|
| billing (invoice + dunning) | 2,309 | 9 | 4 |
| payments | 2,169 | 6 | 3 |
| subscriptions | 2,357 | 18 | 3 |
| provisioning | 1,883 | 12 | 3 |
| domains | 2,166 | 9 | 4 |
| ssl | 1,160 | 6 | 3 |
| **Total** | **12,044** | **60** | **20** |

Plus the legacy infrastructure retired alongside migration:
`lib/jobs/OperationalQueues.ts` (335), `lib/jobs/JobProcessor.ts` (245),
`lib/jobs/processors/SubscriptionRenewalProcessor.ts` (315),
`lib/jobs/processors/ProvisioningProcessor.ts` (28),
`lib/core/legacyBridge.ts` (65), `lib/plugins/*` plumbing.

### Coupling hot spots

1. **Invoice ↔ Payment ↔ Subscription triangle** — `routers/invoices.ts`
   dynamically imports `PaymentService`; `PaymentEventHandler` writes to
   `invoices` + `subscriptions`; `SubscriptionService.processRenewalPayment`
   writes to `payments` + `invoices`. Net: three modules co-write two tables.
2. **Subscription ↔ Catalog** — `SubscriptionService` reads
   `subscribedComponents`, `components`, `productComponents`, `products`,
   `plans` directly. Needs `ICatalogService.getProductForSubscription`.
3. **Provisioning ↔ Catalog** — `DomainComponentHandler`, `SslComponentHandler`
   read `subscribedComponents`. Move behind `ICatalogService.getSubscribedComponent`.
4. **Domain ↔ SSL** — `ssl_certificates.domain_id` FK across module boundary.
   Need service calls for lookups; keep FK at DB level for now.
5. **Dunning misplacement** — `DunningManager` currently in
   `lib/subscription/` but schema + business logic are billing. Move to billing.

### Feature count for ordered migration

| Phase 3 feature total | 22 |
|---|---|
| billing | 6 |
| payments | 5 |
| subscriptions | 6 |
| provisioning | 5 |
| **Phase 4 feature total** | **10** |
| domains | 5 |
| ssl | 5 |
| **Combined Phase 3 + 4 features** | **32** |

Each feature is sized ≤1 working day for one worker-droid; dependencies:
`payments ≻ billing ≻ subscriptions ≻ provisioning` within Phase 3;
`domains ≻ ssl` within Phase 4. Phase 3.6 (per-module schema ownership) is
handled feature-by-feature during the port.
