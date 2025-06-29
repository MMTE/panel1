DO $$ BEGIN
 CREATE TYPE "refund_status" AS ENUM('pending', 'succeeded', 'failed', 'canceled', 'pending_manual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "operation_type" AS ENUM('provision', 'suspend', 'unsuspend', 'terminate', 'modify', 'reinstall', 'backup', 'restore');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "provider_type" AS ENUM('cpanel', 'plesk', 'docker', 'kubernetes', 'custom', 'whm', 'directadmin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "provisioning_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'rollback');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "subscription_status" ADD VALUE 'UNPAID';--> statement-breakpoint
ALTER TYPE "subscription_status" ADD VALUE 'TRIALING';--> statement-breakpoint
ALTER TYPE "subscription_status" ADD VALUE 'PAUSED';--> statement-breakpoint
ALTER TYPE "subscription_status" ADD VALUE 'PENDING_CANCELLATION';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dunning_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"campaign_type" varchar(50) NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"scheduled_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"metadata" jsonb,
	"error_message" text,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar(100) NOT NULL,
	"queue_name" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"scheduled_at" timestamp with time zone DEFAULT now(),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"attempt_number" integer DEFAULT 1,
	"max_attempts" integer DEFAULT 3,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_state_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50),
	"reason" varchar(100),
	"metadata" jsonb,
	"user_id" uuid,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provisioning_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "provider_type" NOT NULL,
	"hostname" text NOT NULL,
	"port" integer DEFAULT 2087,
	"username" text,
	"api_key" text,
	"api_secret" text,
	"use_ssl" boolean DEFAULT true,
	"verify_ssl" boolean DEFAULT true,
	"config" jsonb,
	"limits" jsonb,
	"is_active" boolean DEFAULT true,
	"last_health_check" timestamp with time zone,
	"health_status" text,
	"metadata" jsonb,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provisioning_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_instance_id" uuid,
	"provider_id" uuid,
	"operation" "operation_type" NOT NULL,
	"status" "provisioning_status" DEFAULT 'pending',
	"request_data" jsonb,
	"response_data" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempt_number" integer DEFAULT 1,
	"max_attempts" integer DEFAULT 3,
	"error_message" text,
	"error_details" jsonb,
	"job_id" text,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"provider_id" uuid,
	"service_name" text NOT NULL,
	"service_type" text NOT NULL,
	"remote_id" text,
	"remote_data" jsonb,
	"control_panel_url" text,
	"username" text,
	"password" text,
	"disk_quota" integer,
	"bandwidth_quota" integer,
	"email_accounts" integer,
	"databases" integer,
	"subdomains" integer,
	"status" text DEFAULT 'pending',
	"last_sync" timestamp with time zone,
	"metadata" jsonb,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "past_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "failed_payment_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_payment_attempt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "quantity" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "unit_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_method_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "default_payment_method" jsonb;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_payment_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_data" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "attempt_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_status" "refund_status";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dunning_attempts" ADD CONSTRAINT "dunning_attempts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dunning_attempts" ADD CONSTRAINT "dunning_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_state_changes" ADD CONSTRAINT "subscription_state_changes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_state_changes" ADD CONSTRAINT "subscription_state_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_state_changes" ADD CONSTRAINT "subscription_state_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provisioning_providers" ADD CONSTRAINT "provisioning_providers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_service_instance_id_service_instances_id_fk" FOREIGN KEY ("service_instance_id") REFERENCES "service_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_provider_id_provisioning_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provisioning_providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_provider_id_provisioning_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provisioning_providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
