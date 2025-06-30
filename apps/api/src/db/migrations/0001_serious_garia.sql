CREATE TABLE IF NOT EXISTS "plugin_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" varchar(255) NOT NULL,
	"tenant_id" uuid,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_extension_points" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"description" text,
	"schema" jsonb,
	"default_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_hooks" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"event" text NOT NULL,
	"priority" text DEFAULT '0' NOT NULL,
	"handler" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugins" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"description" text,
	"author" varchar(255),
	"status" varchar(50) DEFAULT 'available' NOT NULL,
	"installed_at" timestamp,
	"updated_at" timestamp DEFAULT now(),
	"tenant_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plugin_configs" ADD CONSTRAINT "plugin_configs_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plugin_configs" ADD CONSTRAINT "plugin_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plugin_extension_points" ADD CONSTRAINT "plugin_extension_points_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plugin_hooks" ADD CONSTRAINT "plugin_hooks_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plugins" ADD CONSTRAINT "plugins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
