CREATE TABLE IF NOT EXISTS "audit_log_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requested_by" uuid,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"resource_types" jsonb,
	"format" varchar(10) DEFAULT 'json' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"file_url" text,
	"file_size" varchar(20),
	"record_count" varchar(20),
	"encryption_key" text,
	"download_count" varchar(10) DEFAULT '0' NOT NULL,
	"expires_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"retention_days" varchar(10) DEFAULT '2555' NOT NULL,
	"archive_after_days" varchar(10) DEFAULT '365',
	"immutable" varchar(5) DEFAULT 'true' NOT NULL,
	"encryption_required" varchar(5) DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"resource_id" varchar(255),
	"user_id" uuid,
	"tenant_id" uuid NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"session_id" varchar(255),
	"old_values" jsonb,
	"new_values" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_exports_tenant_status_idx" ON "audit_log_exports" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_exports_requested_by_idx" ON "audit_log_exports" ("requested_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_exports_created_at_idx" ON "audit_log_exports" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_retention_tenant_resource_idx" ON "audit_log_retention_policies" ("tenant_id","resource_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_type_idx" ON "audit_logs" ("action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_resource_type_idx" ON "audit_logs" ("resource_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_resource_id_idx" ON "audit_logs" ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_idx" ON "audit_logs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON "audit_logs" ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_user_resource_idx" ON "audit_logs" ("user_id","resource_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_time_idx" ON "audit_logs" ("tenant_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log_exports" ADD CONSTRAINT "audit_log_exports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log_exports" ADD CONSTRAINT "audit_log_exports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log_retention_policies" ADD CONSTRAINT "audit_log_retention_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
