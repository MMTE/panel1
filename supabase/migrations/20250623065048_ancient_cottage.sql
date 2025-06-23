/*
  # Add Audit Log RPC Function

  1. New Function
    - `log_audit_event` - Secure RPC function to log audit events
    
  2. Security
    - Function executes with security definer privileges to bypass RLS
    - Allows frontend to securely log audit events without direct table access
*/

-- Create RPC function for audit logging
CREATE OR REPLACE FUNCTION log_audit_event(
  user_id uuid,
  action_type text,
  resource_type text DEFAULT NULL,
  resource_id uuid DEFAULT NULL,
  old_values jsonb DEFAULT NULL,
  new_values jsonb DEFAULT NULL,
  ip_address inet DEFAULT NULL,
  user_agent text DEFAULT NULL,
  tenant_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of function creator
SET search_path = public
AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action_type,
    resource_type,
    resource_id,
    old_values,
    new_values,
    ip_address,
    user_agent,
    tenant_id,
    occurred_at
  ) VALUES (
    user_id,
    action_type,
    resource_type,
    resource_id,
    old_values,
    new_values,
    ip_address,
    user_agent,
    tenant_id,
    now()
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION log_audit_event TO authenticated;

-- Comment on function
COMMENT ON FUNCTION log_audit_event IS 'Securely logs audit events, bypassing RLS policies';