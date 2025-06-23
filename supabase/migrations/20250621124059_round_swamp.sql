/*
  # Events, Webhooks, and Audit System

  1. New Tables
    - `event_logs` - Stores all system events for webhook dispatch and auditing
    - `webhooks` - Stores webhook configurations
    - `webhook_deliveries` - Logs webhook delivery attempts and status
    - `audit_logs` - Records significant user actions and system events

  2. Security
    - Enable RLS on all new tables
    - Add policies for admin access and user-specific data access
*/

-- Event Logs Table (for webhook dispatch and system events)
CREATE TABLE IF NOT EXISTS event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  event_data jsonb NOT NULL,
  entity_type text,
  entity_id uuid,
  user_id uuid REFERENCES users(id),
  occurred_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,
  webhook_dispatched boolean DEFAULT false
);

-- Webhooks Configuration Table
CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  event_types text[] NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Webhook Deliveries Table (for tracking delivery attempts)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid REFERENCES webhooks(id) ON DELETE CASCADE,
  event_log_id uuid REFERENCES event_logs(id) ON DELETE CASCADE,
  attempt_number integer DEFAULT 1,
  status text NOT NULL, -- 'pending', 'success', 'failed', 'retrying'
  response_code integer,
  response_body text,
  error_message text,
  attempted_at timestamptz DEFAULT now(),
  next_retry_at timestamptz
);

-- Audit Logs Table (for compliance and security tracking)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  action_type text NOT NULL,
  resource_type text,
  resource_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Event Logs Policies
CREATE POLICY "Admins can read all event logs"
  ON event_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "System can insert event logs"
  ON event_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Webhooks Policies
CREATE POLICY "Admins can manage webhooks"
  ON webhooks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

-- Webhook Deliveries Policies
CREATE POLICY "Admins can read webhook deliveries"
  ON webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "System can manage webhook deliveries"
  ON webhook_deliveries
  FOR ALL
  TO authenticated
  USING (true);

-- Audit Logs Policies
CREATE POLICY "Admins can read all audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_event_logs_event_type ON event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_occurred_at ON event_logs(occurred_at);
CREATE INDEX IF NOT EXISTS idx_event_logs_processed ON event_logs(processed);
CREATE INDEX IF NOT EXISTS idx_event_logs_webhook_dispatched ON event_logs(webhook_dispatched);
CREATE INDEX IF NOT EXISTS idx_event_logs_entity ON event_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_webhooks_event_types ON webhooks USING GIN(event_types);
CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON webhooks(is_active);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs(occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Add updated_at trigger for webhooks
CREATE TRIGGER update_webhooks_updated_at 
  BEFORE UPDATE ON webhooks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();