-- Sysadmin Service Logs (Hot Logs)
-- Unified logging for Neon, Vercel, SQL Server actions in Sysadmin Portal

CREATE TABLE IF NOT EXISTS sysadmin_service_logs (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('neon', 'vercel', 'sqlserver', 'autoexclusion')),
  action TEXT NOT NULL,
  step TEXT,
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message TEXT NOT NULL,
  latency_ms INT,
  actor_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sysadmin_service_logs_service ON sysadmin_service_logs(service);
CREATE INDEX IF NOT EXISTS idx_sysadmin_service_logs_run_id ON sysadmin_service_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_sysadmin_service_logs_created_at ON sysadmin_service_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sysadmin_service_logs_level ON sysadmin_service_logs(level);

-- Comment for documentation
COMMENT ON TABLE sysadmin_service_logs IS 'Hot logs for sysadmin portal actions - Neon, Vercel, SQL Server tests and operations';

