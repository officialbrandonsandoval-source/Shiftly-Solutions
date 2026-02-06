CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone VARCHAR(20) NOT NULL,
  dealership_id UUID NOT NULL REFERENCES dealerships(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  qualification_score INTEGER,
  last_message_at TIMESTAMPTZ
);

CREATE INDEX idx_conversations_customer ON conversations(customer_phone, dealership_id);
CREATE INDEX idx_conversations_dealership_status ON conversations(dealership_id, status);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
