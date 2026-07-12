-- 0005_ledger.sql — Double-entry ledger schema (D2 money core).
--
-- NOTE: decorative under `push:pg` today (drizzle-kit push applies the live
-- schema directly). This file is the equivalent raw SQL, kept correct and
-- complete so the future `push:pg → migrate` cutover can apply it as-is.
-- Mirrors modules/billing/src/ledger/schema.ts exactly.
--
-- Money is integer minor units (amount_minor bigint), NEVER decimal.

-- ----- enums ----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "ledger_account_type" AS ENUM ('asset', 'liability', 'revenue', 'equity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ledger_source_type" AS ENUM ('invoice', 'payment', 'refund', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ledger_transaction_status" AS ENUM ('pending', 'posted', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ledger_entry_direction" AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "refund_record_status" AS ENUM ('pending', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----- ledger_accounts ------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"type" "ledger_account_type" NOT NULL,
	"currency" char(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accounts_tenant_code_currency_uniq"
	ON "ledger_accounts" ("tenant_id", "code", "currency");

-- ----- ledger_transactions --------------------------------------------------

CREATE TABLE IF NOT EXISTS "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"source_type" "ledger_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"period_start" date,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "ledger_transaction_status" DEFAULT 'posted' NOT NULL
);

-- Idempotency key: one ledger transaction per source per period.
-- NULL period_start values are treated as distinct by Postgres in a unique index,
-- which is the desired semantics for one-shot sources.
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_uniq"
	ON "ledger_transactions" ("tenant_id", "source_type", "source_id", "period_start");

CREATE INDEX IF NOT EXISTS "ledger_transactions_tenant_idx"
	ON "ledger_transactions" ("tenant_id");

-- ----- ledger_entries -------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "ledger_entry_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "ledger_entries"
	ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk"
	FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "ledger_entries"
	ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk"
	FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "ledger_entries"
	ADD CONSTRAINT "ledger_entries_amount_minor_nonneg_check"
	CHECK ("amount_minor" >= 0);

CREATE INDEX IF NOT EXISTS "ledger_entries_tenant_account_idx"
	ON "ledger_entries" ("tenant_id", "account_id");

CREATE INDEX IF NOT EXISTS "ledger_entries_transaction_idx"
	ON "ledger_entries" ("transaction_id");

-- ----- refund_records (append-only) -----------------------------------------

CREATE TABLE IF NOT EXISTS "refund_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"gateway_ref" text,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "refund_record_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "refund_records"
	ADD CONSTRAINT "refund_records_amount_minor_positive_check"
	CHECK ("amount_minor" > 0);

CREATE INDEX IF NOT EXISTS "refund_records_tenant_payment_idx"
	ON "refund_records" ("tenant_id", "payment_id");

-- ----- webhook_events (dedup, composite PK) ---------------------------------

CREATE TABLE IF NOT EXISTS "webhook_events" (
	"tenant_id" uuid NOT NULL,
	"gateway_name" text NOT NULL,
	"event_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("tenant_id", "gateway_name", "event_id")
);
