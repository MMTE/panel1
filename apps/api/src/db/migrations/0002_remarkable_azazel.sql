ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN';--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE 'MANAGER';--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE 'SUPPORT_AGENT';--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE 'BILLING_AGENT';--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE 'CLIENT_USER';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"description" text NOT NULL,
	"conditions" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "permissions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"role_id" "user_role" NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
