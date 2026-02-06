CREATE TABLE customer_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  context_type VARCHAR(50) NOT NULL,
  context_value JSONB NOT NULL,
  confidence NUMERIC(3,2),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, context_type)
);

CREATE INDEX idx_context_conversation_type ON customer_context(conversation_id, context_type);
