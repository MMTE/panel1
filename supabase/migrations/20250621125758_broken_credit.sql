/*
  # Plugin Marketplace Database Schema

  1. New Tables
    - `plugin_reviews` - User reviews and ratings for plugins
    - `plugin_downloads` - Track plugin download statistics
    - `plugin_categories` - Plugin categories for organization

  2. Security
    - Enable RLS on all tables
    - Add policies for user access to reviews
    - Add policies for admin access to statistics
*/

-- Plugin Reviews Table
CREATE TABLE IF NOT EXISTS plugin_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_name text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  helpful integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(plugin_name, user_id)
);

-- Plugin Downloads Table
CREATE TABLE IF NOT EXISTS plugin_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_name text NOT NULL,
  user_id uuid REFERENCES users(id),
  ip_address inet,
  user_agent text,
  downloaded_at timestamptz DEFAULT now()
);

-- Plugin Categories Table
CREATE TABLE IF NOT EXISTS plugin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  icon text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE plugin_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_categories ENABLE ROW LEVEL SECURITY;

-- Plugin Reviews Policies
CREATE POLICY "Users can read all plugin reviews"
  ON plugin_reviews
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create their own reviews"
  ON plugin_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own reviews"
  ON plugin_reviews
  FOR UPDATE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own reviews"
  ON plugin_reviews
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Plugin Downloads Policies
CREATE POLICY "Admins can read all download stats"
  ON plugin_downloads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "System can insert download records"
  ON plugin_downloads
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Plugin Categories Policies
CREATE POLICY "Anyone can read plugin categories"
  ON plugin_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage plugin categories"
  ON plugin_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'ADMIN'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin_name ON plugin_reviews(plugin_name);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_rating ON plugin_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_created_at ON plugin_reviews(created_at);

CREATE INDEX IF NOT EXISTS idx_plugin_downloads_plugin_name ON plugin_downloads(plugin_name);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_downloaded_at ON plugin_downloads(downloaded_at);

CREATE INDEX IF NOT EXISTS idx_plugin_categories_sort_order ON plugin_categories(sort_order);

-- Add updated_at trigger for reviews
CREATE TRIGGER update_plugin_reviews_updated_at 
  BEFORE UPDATE ON plugin_reviews 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default categories
INSERT INTO plugin_categories (name, description, icon, sort_order) VALUES
('Analytics', 'Analytics and reporting plugins', 'BarChart3', 1),
('Payment', 'Payment processing and billing plugins', 'CreditCard', 2),
('Communication', 'Email, SMS, and notification plugins', 'MessageSquare', 3),
('Security', 'Security and authentication plugins', 'Shield', 4),
('Integration', 'Third-party service integrations', 'Link', 5),
('Automation', 'Workflow and automation plugins', 'Zap', 6),
('UI/UX', 'User interface and experience plugins', 'Palette', 7),
('Utility', 'General utility and helper plugins', 'Tool', 8)
ON CONFLICT (name) DO NOTHING;