-- Migration for invoice counters table
CREATE TABLE IF NOT EXISTS "invoice_counters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL,
  "prefix" text DEFAULT 'INV' NOT NULL,
  "suffix" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  UNIQUE("tenant_id", "year")
); 