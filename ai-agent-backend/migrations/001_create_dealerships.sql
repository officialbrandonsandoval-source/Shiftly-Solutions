CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE dealerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Phoenix',
  crm_type VARCHAR(50),
  crm_config JSONB,
  agent_config JSONB DEFAULT '{"qualification_threshold": 60, "escalation_keywords": ["manager", "speak to someone", "human"]}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealerships_active ON dealerships(active, created_at);

-- Seed a default dealership for development
INSERT INTO dealerships (id, name, phone, timezone) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Shiftly Dev Dealership', '+14805550001', 'America/Phoenix');
