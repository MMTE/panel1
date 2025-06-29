DO $$ BEGIN
 CREATE TYPE "dns_record_type" AS ENUM('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "domain_operation" AS ENUM('register', 'renew', 'transfer', 'update_nameservers', 'update_contacts', 'enable_privacy', 'disable_privacy');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "domain_status" AS ENUM('active', 'expired', 'pending_transfer', 'pending_renewal', 'suspended', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ssl_certificate_status" AS ENUM('pending', 'active', 'expired', 'revoked', 'cancelled', 'validation_failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ssl_certificate_type" AS ENUM('domain_validated', 'organization_validated', 'extended_validation', 'wildcard', 'multi_domain');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ssl_operation" AS ENUM('issue', 'renew', 'revoke', 'install', 'validate', 'reissue');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ssl_provider" AS ENUM('letsencrypt', 'sectigo', 'digicert', 'globalsign', 'godaddy', 'namecheap', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dns_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid,
	"name" text NOT NULL,
	"type" "dns_record_type" NOT NULL,
	"value" text NOT NULL,
	"ttl" integer DEFAULT 3600,
	"priority" integer,
	"is_active" boolean DEFAULT true,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dns_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"zone_name" text NOT NULL,
	"soa_record" jsonb,
	"is_active" boolean DEFAULT true,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domain_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"operation" "domain_operation" NOT NULL,
	"status" text DEFAULT 'pending',
	"request_data" jsonb,
	"response_data" jsonb,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_name" text NOT NULL,
	"client_id" uuid,
	"subscription_id" uuid,
	"registrar" text NOT NULL,
	"registrar_domain_id" text,
	"registered_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"auto_renew" boolean DEFAULT true,
	"renewal_period" integer DEFAULT 1,
	"status" "domain_status" DEFAULT 'active',
	"nameservers" jsonb DEFAULT '[]'::jsonb,
	"registrant_contact" jsonb,
	"admin_contact" jsonb,
	"tech_contact" jsonb,
	"billing_contact" jsonb,
	"privacy_enabled" boolean DEFAULT false,
	"auth_code" text,
	"transfer_lock" boolean DEFAULT true,
	"registration_cost" numeric(10, 2),
	"renewal_cost" numeric(10, 2),
	"config" jsonb,
	"metadata" jsonb,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "domains_domain_name_unique" UNIQUE("domain_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ssl_certificate_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" uuid,
	"operation" "ssl_operation" NOT NULL,
	"status" text DEFAULT 'pending',
	"request_data" jsonb,
	"response_data" jsonb,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ssl_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_name" text NOT NULL,
	"type" "ssl_certificate_type" NOT NULL,
	"provider" "ssl_provider" NOT NULL,
	"primary_domain" text NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb,
	"wildcard_domains" jsonb DEFAULT '[]'::jsonb,
	"client_id" uuid,
	"domain_id" uuid,
	"service_instance_id" uuid,
	"certificate" text,
	"private_key" text,
	"certificate_chain" text,
	"csr" text,
	"provider_certificate_id" text,
	"provider_order_id" text,
	"validation_method" text,
	"validation_data" jsonb,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"auto_renew" boolean DEFAULT true,
	"renewal_buffer" integer DEFAULT 30,
	"status" "ssl_certificate_status" DEFAULT 'pending',
	"installations" jsonb DEFAULT '[]'::jsonb,
	"cost" numeric(10, 2),
	"renewal_cost" numeric(10, 2),
	"config" jsonb,
	"metadata" jsonb,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ssl_validation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_id" uuid,
	"domain" text NOT NULL,
	"method" text NOT NULL,
	"record_name" text,
	"record_value" text,
	"record_type" text,
	"http_path" text,
	"http_content" text,
	"validation_email" text,
	"is_validated" boolean DEFAULT false,
	"validated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"metadata" jsonb,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_zone_id_dns_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "dns_zones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_zones" ADD CONSTRAINT "dns_zones_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dns_zones" ADD CONSTRAINT "dns_zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain_operations" ADD CONSTRAINT "domain_operations_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain_operations" ADD CONSTRAINT "domain_operations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domains" ADD CONSTRAINT "domains_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domains" ADD CONSTRAINT "domains_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domains" ADD CONSTRAINT "domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_certificate_operations" ADD CONSTRAINT "ssl_certificate_operations_certificate_id_ssl_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "ssl_certificates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_certificate_operations" ADD CONSTRAINT "ssl_certificate_operations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_service_instance_id_service_instances_id_fk" FOREIGN KEY ("service_instance_id") REFERENCES "service_instances"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_validation_records" ADD CONSTRAINT "ssl_validation_records_certificate_id_ssl_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "ssl_certificates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssl_validation_records" ADD CONSTRAINT "ssl_validation_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
