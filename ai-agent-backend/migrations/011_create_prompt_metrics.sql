CREATE TABLE prompt_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version VARCHAR(20) NOT NULL,
  variant VARCHAR(1) DEFAULT 'A',
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  response_time_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  qualification_delta NUMERIC(5,2),
  escalated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_metrics_version ON prompt_metrics(prompt_version, variant);
CREATE INDEX idx_prompt_metrics_created ON prompt_metrics(created_at DESC);

-- Add variant column to agent_prompts for A/B testing
ALTER TABLE agent_prompts ADD COLUMN IF NOT EXISTS variant VARCHAR(1) DEFAULT 'A';
ALTER TABLE agent_prompts ADD COLUMN IF NOT EXISTS ab_ratio NUMERIC(3,2) DEFAULT 1.0;
