CREATE TABLE job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(50) NOT NULL,
  job_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'processing',
  payload JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_job_logs_queue ON job_logs(queue_name, status);
CREATE INDEX idx_job_logs_created ON job_logs(created_at DESC);
