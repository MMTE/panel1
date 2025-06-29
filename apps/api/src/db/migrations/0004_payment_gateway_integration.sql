-- Migration: Add Payment Gateway Integration Fields
-- This migration adds support for real payment gateway integration with refunds

-- Add refund status enum
CREATE TYPE "refund_status" AS ENUM('pending', 'succeeded', 'failed', 'canceled', 'pending_manual');

-- Add new fields to payments table
ALTER TABLE "payments" 
ADD COLUMN "gateway_payment_id" text,
ADD COLUMN "gateway_data" jsonb,
ADD COLUMN "error_message" text,
ADD COLUMN "refund_amount" numeric(10,2),
ADD COLUMN "refund_status" "refund_status",
ADD COLUMN "refund_id" text,
ADD COLUMN "refund_reason" text,
ADD COLUMN "refunded_at" timestamp with time zone;

-- Add payment method fields to subscriptions table
ALTER TABLE "subscriptions"
ADD COLUMN "payment_method_id" text,
ADD COLUMN "default_payment_method" jsonb;

-- Create index for faster lookups
CREATE INDEX "idx_payments_gateway_payment_id" ON "payments" ("gateway_payment_id");
CREATE INDEX "idx_payments_refund_status" ON "payments" ("refund_status");
CREATE INDEX "idx_subscriptions_payment_method" ON "subscriptions" ("payment_method_id");

-- Update existing records to handle nulls properly
UPDATE "payments" SET "gateway_payment_id" = "gateway_id" WHERE "gateway_id" IS NOT NULL; 