-- Job System Migration
-- Add job scheduling infrastructure for subscription automation

-- Job tracking table
CREATE TABLE scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(100) NOT NULL,
    queue_name VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    attempt_number INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 3,
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dunning attempts tracking
CREATE TABLE dunning_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES subscriptions(id),
    campaign_type VARCHAR(50) NOT NULL, -- 'email_reminder', 'grace_period', 'suspension'
    attempt_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'pending', 'sent', 'delivered', 'failed', 'completed'
    scheduled_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    next_attempt_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    error_message TEXT,
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription state changes audit
CREATE TABLE subscription_state_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES subscriptions(id),
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    reason VARCHAR(100),
    metadata JSONB,
    user_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_scheduled_jobs_tenant_status ON scheduled_jobs(tenant_id, status);
CREATE INDEX idx_scheduled_jobs_scheduled_at ON scheduled_jobs(scheduled_at);
CREATE INDEX idx_scheduled_jobs_queue_status ON scheduled_jobs(queue_name, status);

CREATE INDEX idx_dunning_attempts_subscription ON dunning_attempts(subscription_id);
CREATE INDEX idx_dunning_attempts_next_attempt ON dunning_attempts(next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_dunning_attempts_tenant ON dunning_attempts(tenant_id);

CREATE INDEX idx_subscription_state_changes_subscription ON subscription_state_changes(subscription_id);
CREATE INDEX idx_subscription_state_changes_tenant ON subscription_state_changes(tenant_id);

-- Comments for documentation
COMMENT ON TABLE scheduled_jobs IS 'Tracks all scheduled background jobs for subscription automation';
COMMENT ON TABLE dunning_attempts IS 'Tracks dunning management attempts and campaigns';
COMMENT ON TABLE subscription_state_changes IS 'Audit trail for subscription status changes'; 