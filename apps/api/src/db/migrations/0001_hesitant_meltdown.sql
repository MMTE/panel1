DO $$ BEGIN
 CREATE TYPE "gateway_status" AS ENUM('ACTIVE', 'INACTIVE', 'PENDING_SETUP', 'ERROR');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"gateway_name" text NOT NULL,
	"attempt_number" integer DEFAULT 1,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"gateway_response" jsonb,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_gateway_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gateway_name" text NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 1,
	"config" jsonb,
	"webhook_url" text,
	"webhook_secret" text,
	"supported_currencies" jsonb DEFAULT '["USD"]'::jsonb,
	"supported_countries" jsonb DEFAULT '["US"]'::jsonb,
	"capabilities" jsonb,
	"status" "gateway_status" DEFAULT 'PENDING_SETUP',
	"last_health_check" timestamp with time zone,
	"health_check_status" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
