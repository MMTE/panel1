/*
  # Seed Initial Data for Panel1

  1. Sample Plans
    - Basic hosting plan
    - Professional hosting plan
    - Enterprise hosting plan

  2. Sample Admin User (will be created via Supabase Auth)
*/

-- Insert sample plans
INSERT INTO plans (name, description, price, currency, interval, features) VALUES
(
  'Basic Hosting',
  'Perfect for small websites and personal projects',
  9.99,
  'USD',
  'MONTHLY',
  '{
    "storage": "10GB SSD Storage",
    "bandwidth": "100GB Bandwidth",
    "domains": "1 Domain",
    "email": "5 Email Accounts",
    "support": "Email Support"
  }'::jsonb
),
(
  'Professional Hosting',
  'Ideal for growing businesses and e-commerce sites',
  19.99,
  'USD',
  'MONTHLY',
  '{
    "storage": "50GB SSD Storage",
    "bandwidth": "500GB Bandwidth",
    "domains": "10 Domains",
    "email": "25 Email Accounts",
    "support": "Priority Support",
    "ssl": "Free SSL Certificate",
    "backup": "Daily Backups"
  }'::jsonb
),
(
  'Enterprise Hosting',
  'For high-traffic websites and mission-critical applications',
  49.99,
  'USD',
  'MONTHLY',
  '{
    "storage": "200GB SSD Storage",
    "bandwidth": "Unlimited Bandwidth",
    "domains": "Unlimited Domains",
    "email": "Unlimited Email Accounts",
    "support": "24/7 Phone Support",
    "ssl": "Wildcard SSL Certificate",
    "backup": "Hourly Backups",
    "cdn": "Global CDN",
    "monitoring": "Advanced Monitoring"
  }'::jsonb
),
(
  'Basic Annual',
  'Basic hosting plan with annual billing discount',
  99.99,
  'USD',
  'YEARLY',
  '{
    "storage": "10GB SSD Storage",
    "bandwidth": "100GB Bandwidth",
    "domains": "1 Domain",
    "email": "5 Email Accounts",
    "support": "Email Support",
    "discount": "2 months free"
  }'::jsonb
),
(
  'Professional Annual',
  'Professional hosting plan with annual billing discount',
  199.99,
  'USD',
  'YEARLY',
  '{
    "storage": "50GB SSD Storage",
    "bandwidth": "500GB Bandwidth",
    "domains": "10 Domains",
    "email": "25 Email Accounts",
    "support": "Priority Support",
    "ssl": "Free SSL Certificate",
    "backup": "Daily Backups",
    "discount": "2 months free"
  }'::jsonb
);