CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  dealership_id UUID NOT NULL REFERENCES dealerships(id),
  customer_phone VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255),
  vehicle VARCHAR(255) NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  calendar_event_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_conversation ON bookings(conversation_id);
CREATE INDEX idx_bookings_dealership ON bookings(dealership_id, scheduled_date);
CREATE INDEX idx_bookings_status ON bookings(status);
