/*
  # Multi-Tenant Support Implementation

  1. Add tenant_id to all tables
  2. Create tenant management tables
  3. Update RLS policies for tenant isolation
  4. Add tenant-specific settings and branding
*/

-- Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  domain text,
  settings jsonb DEFAULT '{}',
  branding jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tenant_users junction table for multi-tenant user access
CREATE TABLE IF NOT EXISTS tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role user_role DEFAULT 'CLIENT',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Add tenant_id to existing tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- Add tenant_id to plugin system tables
ALTER TABLE plugin_registry ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE plugin_settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE plugin_errors ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE plugin_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- Add tenant_id to event and audit systems
ALTER TABLE event_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- Add tenant_id to marketplace tables
ALTER TABLE plugin_reviews ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE plugin_downloads ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- Enable RLS on tenant tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- Tenant management policies
CREATE POLICY "Super admins can manage all tenants"
  ON tenants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
      AND tenant_id IS NULL -- Super admin has no tenant_id
    )
  );

CREATE POLICY "Tenant admins can read their tenant"
  ON tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- Tenant user policies
CREATE POLICY "Users can read their tenant memberships"
  ON tenant_users
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Update existing RLS policies to include tenant isolation

-- Users policies (updated)
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Admins can read all users" ON users;

CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR (
      tenant_id IN (
        SELECT tenant_id FROM users 
        WHERE auth_user_id = auth.uid() 
        AND role = 'ADMIN'
      )
    )
  );

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Event logs policies (updated for tenant isolation)
DROP POLICY IF EXISTS "Admins can read all event logs" ON event_logs;
DROP POLICY IF EXISTS "System can insert event logs" ON event_logs;

CREATE POLICY "Tenant admins can read tenant event logs"
  ON event_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "System can insert event logs"
  ON event_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Audit logs policies (updated for tenant isolation)
DROP POLICY IF EXISTS "Admins can read all audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can read their own audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;

CREATE POLICY "Tenant admins can read tenant audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Users can read their own audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert audit logs"
  ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Plugin system policies (updated for tenant isolation)
DROP POLICY IF EXISTS "Admins can manage plugin registry" ON plugin_registry;
DROP POLICY IF EXISTS "Anyone can read enabled plugins" ON plugin_registry;

CREATE POLICY "Tenant admins can manage tenant plugins"
  ON plugin_registry
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Users can read enabled tenant plugins"
  ON plugin_registry
  FOR SELECT
  TO authenticated
  USING (
    enabled = true 
    AND tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- Update plugin settings policies
DROP POLICY IF EXISTS "Admins can manage all plugin settings" ON plugin_settings;

CREATE POLICY "Tenant admins can manage tenant plugin settings"
  ON plugin_settings
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

-- Create indexes for tenant-based queries
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plans_tenant_id ON plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_tenant_id ON event_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_tenant_id ON plugin_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plugin_settings_tenant_id ON plugin_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant_id ON webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);

-- Add updated_at triggers for new tables
CREATE TRIGGER update_tenants_updated_at 
  BEFORE UPDATE ON tenants 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default tenant for existing data
INSERT INTO tenants (id, name, slug, settings, branding) 
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Default Tenant',
  'default',
  '{"features": {"plugins": true, "multi_currency": true}}',
  '{"primary_color": "#7c3aed", "logo_url": null, "company_name": "Panel1"}'
) ON CONFLICT (id) DO NOTHING;

-- Update existing records to use default tenant
UPDATE users SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE clients SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE plans SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE subscriptions SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE invoices SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE payments SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE event_logs SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE audit_logs SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE plugin_registry SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE plugin_settings SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE plugin_errors SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE plugin_events SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE webhooks SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE plugin_reviews SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
UPDATE plugin_downloads SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;