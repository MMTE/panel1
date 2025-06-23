/*
  # Enhanced Billing System

  1. New Tables
    - `subscription_changes` - Tracks subscription upgrades/downgrades
    - `proration_items` - Stores proration calculations
    - `billing_cycles` - Manages billing cycle information

  2. Enhanced Tables
    - Add fields to existing tables for better billing management
*/

-- Subscription Changes Table (for tracking upgrades/downgrades)
CREATE TABLE IF NOT EXISTS subscription_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  old_plan_id uuid REFERENCES plans(id),
  new_plan_id uuid REFERENCES plans(id),
  change_type text NOT NULL, -- 'upgrade', 'downgrade', 'cancel'
  effective_date timestamptz NOT NULL,
  proration_amount decimal(10,2) DEFAULT 0,
  proration_credit decimal(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false
);

-- Proration Items Table (for detailed proration calculations)
CREATE TABLE IF NOT EXISTS proration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_change_id uuid REFERENCES subscription_changes(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id),
  description text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount decimal(10,2) NOT NULL,
  is_credit boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Billing Cycles Table (for managing complex billing scenarios)
CREATE TABLE IF NOT EXISTS billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'billed', 'paid', 'failed'
  invoice_id uuid REFERENCES invoices(id),
  created_at timestamptz DEFAULT now()
);

-- Add new columns to existing tables
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle_anchor timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS proration_behavior text DEFAULT 'create_prorations';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type text DEFAULT 'regular'; -- 'regular', 'proration', 'credit'
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES invoices(id);

ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_period_days integer DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS setup_fee decimal(10,2) DEFAULT 0;

-- Enable Row Level Security
ALTER TABLE subscription_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE proration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;

-- Subscription Changes Policies
CREATE POLICY "Users can read own subscription changes"
  ON subscription_changes
  FOR SELECT
  TO authenticated
  USING (
    subscription_id IN (
      SELECT s.id FROM subscriptions s
      JOIN clients c ON s.client_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage subscription changes"
  ON subscription_changes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

-- Proration Items Policies
CREATE POLICY "Users can read own proration items"
  ON proration_items
  FOR SELECT
  TO authenticated
  USING (
    subscription_change_id IN (
      SELECT sc.id FROM subscription_changes sc
      JOIN subscriptions s ON sc.subscription_id = s.id
      JOIN clients c ON s.client_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Billing Cycles Policies
CREATE POLICY "Users can read own billing cycles"
  ON billing_cycles
  FOR SELECT
  TO authenticated
  USING (
    subscription_id IN (
      SELECT s.id FROM subscriptions s
      JOIN clients c ON s.client_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_changes_subscription_id ON subscription_changes(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_changes_effective_date ON subscription_changes(effective_date);
CREATE INDEX IF NOT EXISTS idx_subscription_changes_processed ON subscription_changes(processed);

CREATE INDEX IF NOT EXISTS idx_proration_items_subscription_change_id ON proration_items(subscription_change_id);
CREATE INDEX IF NOT EXISTS idx_proration_items_invoice_id ON proration_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_subscription_id ON billing_cycles(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_status ON billing_cycles(status);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_period_end ON billing_cycles(period_end);

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices(invoice_type);