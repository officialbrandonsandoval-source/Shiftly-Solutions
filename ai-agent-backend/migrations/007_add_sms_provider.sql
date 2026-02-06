ALTER TABLE dealerships ADD COLUMN sms_provider VARCHAR(20) DEFAULT 'twilio';
ALTER TABLE dealerships ADD COLUMN sms_config JSONB;
ALTER TABLE dealerships ADD COLUMN phone_ownership VARCHAR(20) DEFAULT 'new';
-- phone_ownership values: 'new', 'ported', 'carrier_api'

CREATE INDEX idx_dealerships_sms_provider ON dealerships(sms_provider);