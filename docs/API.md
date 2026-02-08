# Shiftly AI Agent — API Documentation

## Base URL

- **Production:** `https://api.shiftly.ai`
- **Staging:** `https://staging.api.shiftly.ai`

## Authentication

All `/api/*` routes require an API key via the `x-api-key` header:

```
x-api-key: your-dealership-api-key
```

Webhook routes (`/webhook/*`) and health checks are unauthenticated (Twilio signature validation is used for SMS webhooks).

---

## Endpoints

### Health

#### `GET /health`

No authentication required.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-06T10:00:00.000Z"
}
```

---

### Agent

#### `POST /api/agent/handle-message`

Process an inbound customer message and generate an AI response.

**Request:**
```json
{
  "customer_phone": "+14805551234",
  "dealership_id": "00000000-0000-0000-0000-000000000001",
  "message": "I'm looking for a used Camry under $25k",
  "channel": "sms"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_phone` | string | Yes | E.164 phone number |
| `dealership_id` | string (UUID) | Yes | Dealership identifier |
| `message` | string (10+ chars) | Yes | Customer message text |
| `channel` | string | No | `sms` (default), `email`, `web` |

**Response (200):**
```json
{
  "success": true,
  "conversation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "response": "Great choice! The Camry is super popular. Are you looking for a specific year range?",
  "action_taken": "responded",
  "qualification_score": 45
}
```

**Response (escalated — 200):**
```json
{
  "success": true,
  "conversation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "response": "Let me connect you with one of our team members...",
  "action_taken": "escalated",
  "qualification_score": 45
}
```

---

#### `GET /api/agent/conversation/:customerId`

Retrieve full conversation history for a customer.

**Query Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| `dealership_id` | Yes | UUID of the dealership |

**Response (200):**
```json
{
  "success": true,
  "conversation": {
    "id": "...",
    "customer_phone": "+14805551234",
    "dealership_id": "...",
    "status": "active",
    "qualification_score": 65,
    "messages": [ ... ]
  }
}
```

---

#### `POST /api/agent/qualify`

Get the current qualification assessment for a conversation.

**Request:**
```json
{
  "conversation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "dealership_id": "00000000-0000-0000-0000-000000000001"
}
```

**Response (200):**
```json
{
  "success": true,
  "qualification": {
    "score": 75,
    "signals": { ... }
  }
}
```

---

#### `POST /api/agent/book-test-drive`

Book a test drive appointment for a customer.

**Request:**
```json
{
  "conversation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "dealership_id": "00000000-0000-0000-0000-000000000001",
  "customer_phone": "+14805551234",
  "customer_name": "John Doe",
  "vehicle": "2024 Toyota Camry",
  "date": "2026-02-08",
  "time": "10:00",
  "timezone": "America/Phoenix"
}
```

**Response (200):**
```json
{
  "success": true,
  "booking_id": "b1c2d3e4-f5a6-7890-bcde-f12345678901",
  "calendar_event_id": "google_event_abc123",
  "crm_appointment_id": "ghl_appt_xyz789",
  "confirmation_message": "You're all set! Test drive for the 2024 Toyota Camry on Saturday Feb 8 at 10:00 AM. See you then! 🚗"
}
```

**Error (409):**
```json
{
  "success": false,
  "error": "Time slot not available",
  "available_slots": [
    { "start": "2026-02-08T11:00:00", "end": "2026-02-08T11:30:00" }
  ]
}
```

---

#### `POST /api/agent/escalate`

Manually escalate a conversation to a human agent.

**Request:**
```json
{
  "conversation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "dealership_id": "00000000-0000-0000-0000-000000000001",
  "reason": "Customer requesting refund"
}
```

**Response (200):**
```json
{
  "success": true,
  "escalation": {
    "assigned_to": "user-id",
    "reason": "Customer requesting refund"
  }
}
```

---

### Chat (Web Channel)

#### `POST /api/chat/message`

Process a message from the web chat widget.

**Request:**
```json
{
  "customer_phone": "+14805551234",
  "dealership_id": "00000000-0000-0000-0000-000000000001",
  "message": "Do you have any SUVs in stock?",
  "channel": "web"
}
```

**Response (200):**
```json
{
  "success": true,
  "conversation_id": "...",
  "response": "We sure do! What's your budget range?",
  "action_taken": "responded",
  "qualification_score": 30
}
```

---

### Webhooks

#### `POST /webhook/sms`

Twilio / Bandwidth inbound SMS webhook. Auto-detects provider by payload format.

#### `POST /webhook/sms/twilio`

Explicit Twilio SMS webhook endpoint.

#### `POST /webhook/sms/bandwidth`

Explicit Bandwidth SMS webhook endpoint.

#### `POST /webhook/email`

Inbound email webhook (e.g., from SendGrid Inbound Parse).

**Request:**
```json
{
  "from": "customer@example.com",
  "to": "dealership@shiftly.ai",
  "subject": "Interested in vehicles",
  "text": "I saw your ad for the Ford F-150...",
  "dealership_id": "00000000-0000-0000-0000-000000000001"
}
```

---

### OAuth

#### `GET /auth/ghl/callback`

GoHighLevel OAuth callback handler. Used during CRM connection setup.

**Query Parameters:**
| Param | Description |
|-------|-------------|
| `code` | Authorization code from GHL |
| `state` | Dealership ID |

---

### Admin

#### `POST /api/admin/dealerships`

Create a new dealership configuration.

#### `GET /api/admin/dealerships/:id`

Get dealership details.

#### `PUT /api/admin/dealerships/:id`

Update dealership configuration.

#### `GET /api/admin/health`

Deep health check (database, Redis, external services).

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

| Status Code | Meaning |
|------------|---------|
| 400 | Bad request / validation error |
| 401 | Missing or invalid API key |
| 404 | Resource not found |
| 409 | Conflict (e.g., time slot taken) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Rate Limits

- `/api/*` routes: **100 requests per minute** per IP
- Webhook routes: No rate limit (provider-controlled)
