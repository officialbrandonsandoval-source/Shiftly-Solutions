CREATE TABLE agent_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  response_guidelines JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX idx_prompts_active ON agent_prompts(active, version);

-- Seed v1.0 prompt
INSERT INTO agent_prompts (version, system_prompt, response_guidelines, active, created_by) VALUES
  ('v1.0',
   'You are a friendly, professional car dealership assistant. Keep responses under 160 characters. Ask one question at a time. Never give exact prices without checking. If frustrated, offer human connection.',
   '{"max_length": 160, "tone": "friendly", "urgency_level": "medium"}',
   true,
   'system');
