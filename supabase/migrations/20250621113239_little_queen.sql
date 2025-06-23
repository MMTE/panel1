/*
  # Plugin System Database Schema

  1. New Tables
    - `plugin_registry` - Stores installed plugins and their metadata
    - `plugin_settings` - Stores plugin configuration settings
    - `plugin_errors` - Logs plugin errors for debugging
    - `plugin_events` - Stores plugin events for auditing

  2. Security
    - Enable RLS on all plugin tables
    - Add policies for admin access to plugin management
    - Add policies for plugins to access their own settings
*/

-- Plugin Registry Table
CREATE TABLE IF NOT EXISTS plugin_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  version text NOT NULL,
  description text,
  author text,
  metadata jsonb NOT NULL,
  status text NOT NULL DEFAULT 'installed',
  enabled boolean DEFAULT false,
  source text,
  installed_at timestamptz DEFAULT now(),
  enabled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Plugin Settings Table
CREATE TABLE IF NOT EXISTS plugin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(plugin_id)
);

-- Plugin Errors Table
CREATE TABLE IF NOT EXISTS plugin_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text NOT NULL,
  operation text NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  occurred_at timestamptz DEFAULT now()
);

-- Plugin Events Table (for auditing)
CREATE TABLE IF NOT EXISTS plugin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text NOT NULL,
  event_type text NOT NULL,
  event_data jsonb,
  user_id uuid REFERENCES users(id),
  occurred_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE plugin_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_events ENABLE ROW LEVEL SECURITY;

-- Plugin Registry Policies
CREATE POLICY "Admins can manage plugin registry"
  ON plugin_registry
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Anyone can read enabled plugins"
  ON plugin_registry
  FOR SELECT
  TO authenticated
  USING (enabled = true);

-- Plugin Settings Policies
CREATE POLICY "Admins can manage all plugin settings"
  ON plugin_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

-- Plugin Errors Policies
CREATE POLICY "Admins can read plugin errors"
  ON plugin_errors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

-- Plugin Events Policies
CREATE POLICY "Admins can read plugin events"
  ON plugin_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Users can read their own plugin events"
  ON plugin_events
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_plugin_registry_name ON plugin_registry(name);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_enabled ON plugin_registry(enabled);
CREATE INDEX IF NOT EXISTS idx_plugin_settings_plugin_id ON plugin_settings(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_errors_plugin_id ON plugin_errors(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_errors_occurred_at ON plugin_errors(occurred_at);
CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin_id ON plugin_events(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_events_event_type ON plugin_events(event_type);
CREATE INDEX IF NOT EXISTS idx_plugin_events_occurred_at ON plugin_events(occurred_at);

-- Add updated_at triggers
CREATE TRIGGER update_plugin_registry_updated_at 
  BEFORE UPDATE ON plugin_registry 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_settings_updated_at 
  BEFORE UPDATE ON plugin_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();