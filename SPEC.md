# Shiftly AI Dealership Agent — Backend Technical Specification

**Version:** 2.0 (as-built + roadmap)
**Author:** Brandon Sandoval / Shiftly Solutions
**Date:** February 6, 2026
**Status:** Phase 1 Complete — Phase 2 In Progress

---

## 0. CURRENT STATE OF THE CODEBASE

Before defining what's next, here's what already exists and works:

| Component | Status | File(s) |
|-----------|--------|---------|
| Express server + middleware | ✅ Built | `src/index.ts`, `src/middleware/` |
| Anthropic (Claude 3.5 Haiku) integration | ✅ Built | `src/services/anthropic.service.ts` |
| SMS: Twilio + Bandwidth adapters | ✅ Built | `src/services/sms/` |
| Webhook routes (Twilio, Bandwidth) | ✅ Built | `src/routes/webhook.routes.ts` |
| Agent service (core message handler) | ✅ Built | `src/services/agent.service.ts` |
| Conversation management (find/create, messages) | ✅ Built | `src/services/database.service.ts` |
| Escalation engine (keyword + frustration + repeated) | ✅ Built | `src/services/escalation.service.ts` |
| Lead qualification scoring | ✅ Built | `src/services/qualification.service.ts` |
| Context extraction (vehicle, budget, timeline, trade-in) | ✅ Built | `src/services/context.service.ts` |
| GoHighLevel CRM adapter | ✅ Built | `src/services/crm/ghl.adapter.ts` |
| CRM factory (abstraction layer) | ✅ Built | `src/services/crm/crm.adapter.ts` |
| Database migrations (7 total) | ✅ Built | `migrations/001-007` |
| Admin dashboard API (metrics, health) | ✅ Built | `src/routes/admin.routes.ts` |
| Agent prompt versioning table | ✅ Built | `migrations/005_create_agent_prompts.sql` |
| Unit tests (agent, CRM, SMS, escalation, qualification) | ✅ Built | `tests/unit/` |
| Docker Compose (Postgres + Redis) | ✅ Built | `docker-compose.yml` |
| Render deployment config | ✅ Built | `render.yaml` |
| Manager Dashboard (React frontend) | ✅ Built | `manager-dashboard/` |

**What is NOT built yet:** Test drive booking flow, Google Calendar integration, multi-channel (email/web), prompt A/B testing runtime, CRM sync pipeline (auto-create contacts on conversation start), queue system (BullMQ), production monitoring/alerting, CI/CD pipeline.

---

## 1. TECH STACK (Final Decisions)

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript 5.9 | Type safety across API boundaries, IDE support, team velocity |
| Runtime | Node.js 18+ | Async I/O for concurrent SMS/API calls, massive npm ecosystem |
| Framework | Express 4 | Already built. Simple, battle-tested, no magic |
| Database | PostgreSQL 15 | JSONB for flexible context, proven at scale, Render-native |
| Cache/Queue | Redis 7 + BullMQ | Conversation state caching, background job processing |
| AI Engine | Anthropic Claude 3.5 Haiku | Cost-efficient ($0.25/1M input), fast (sub-second), SMS-optimized responses |
| SMS Primary | Twilio | Reliability, webhook infrastructure, phone number management |
| SMS Secondary | Bandwidth | Carrier-direct option for dealerships with existing numbers |
| CRM | GoHighLevel (primary) | 80%+ of target dealerships use GHL. Factory pattern supports future CRMs |
| Calendar | Google Calendar API | Test drive booking. GHL calendar as alternative |
| Hosting | Render | Already deployed. Auto-deploy from GitHub, managed Postgres + Redis |
| Monitoring | Winston (logging) + Sentry (errors) | Structured JSON logs in prod, error tracking with stack traces |
| Validation | Zod 4 | Runtime schema validation on all API inputs |

---

## 2. SYSTEM ARCHITECTURE

### 2.1 Data Flow: Message Lifecycle

```
Customer SMS → Twilio/Bandwidth Webhook
       ↓
POST /webhook/sms/twilio (or /bandwidth)
       ↓
resolveDealershipByPhone(to) → dealerships table
       ↓
adapter.validateWebhook(req) → signature verification
       ↓
agentService.handleMessage({phone, dealership_id, message, channel})
       ↓
┌─────────────────────────────────────────────────────────┐
│ AGENT SERVICE PIPELINE                                   │
│                                                          │
│ 1. db.findOrCreateConversation(phone, dealership_id)    │
│ 2. db.addMessage(conv_id, 'customer', message)          │
│ 3. db.getMessages(conv_id) — last 20 messages           │
│ 4. escalation.evaluate(messages)                         │
│    └─ if shouldEscalate → respond + update status        │
│ 5. contextExtraction.extractFromMessages(messages)       │
│    └─ persist vehicle_interest, budget, timeline, trade  │
│ 6. anthropic.generateResponse(messages, systemPrompt)    │
│    └─ retry 3x, fallback to hardcoded responses          │
│ 7. db.addMessage(conv_id, 'agent', response)            │
│ 8. twilio.sendSMS(phone, response)                       │
│ 9. qualification.scoreConversation(conv_id, messages)    │
│ 10. db.logInteraction(conv_id, 'message_sent', metadata) │
└─────────────────────────────────────────────────────────┘
       ↓
Return AgentResponse { conversation_id, response, action_taken, qualification_score }
```

### 2.2 Decision Tree (How Agent Decides)

```
Incoming Message
       ↓
[Escalation Check] ─────── YES ──→ Respond with escalation message
  │                                  Update status = 'escalated'
  │                                  (Future: notify manager via queue)
  NO
  ↓
[Context Extraction] ──→ Extract vehicle/budget/timeline/trade-in
  ↓                      Persist to customer_context table
[Generate AI Response] ─→ Claude 3.5 Haiku with last 10 messages
  ↓                      System prompt from agent_prompts table
[Qualification Score] ──→ Score 0-100 based on keyword analysis
  ↓
[Action Determination]
  ├─ score >= 60 + "test drive" mentioned → action: 'book' (Future)
  ├─ score >= 80 + explicit ask → action: 'book' (Future)
  ├─ escalation triggered → action: 'escalated'
  └─ default → action: 'responded'
```

### 2.3 Escalation Logic (Already Implemented)

The `EscalationService` evaluates in priority order:

1. **Explicit request** (confidence: 0.95): "speak to a human", "transfer me", "operator", "representative"
2. **Multiple frustration signals** (confidence: 0.85): 2+ keywords like "ridiculous", "waste of time", "worst experience"
3. **Frustration + repetition** (confidence: 0.80): Single frustration keyword + customer repeating messages
4. **Complex topics** (confidence: 0.75): "warranty claim", "lemon law", "recall", "lawsuit"
5. **Repeated messages** (confidence: 0.70): Customer sending same message 3+ times
6. **Long conversation** (confidence: 0.55): 15+ customer messages without resolution

### 2.4 Queue System (TO BUILD — Phase 2)

```
BullMQ Queues:
├─ crm-sync        → Create/update GHL contacts after conversation start
├─ test-drive-book  → Book Google Calendar + GHL appointment
├─ notification     → Alert managers on escalation/high-score leads
└─ analytics        → Async logging of token usage, response times
```

**Why BullMQ:** Redis-backed, built for Node.js, handles retries/backoff natively, dead letter queues for failed jobs. Already have Redis in the stack.

---

## 3. CRITICAL DESIGN PATTERNS

### 3.1 Conversation State Management

**Current:** State is reconstructed per request from Postgres. Each `handleMessage` call:
- Fetches conversation row
- Fetches last 20 messages
- Fetches customer_context rows
- Passes to AI as conversation history

**Problem:** Every message = 3-4 DB queries before AI call.

**Planned (Phase 5):** Redis conversation cache.

```typescript
// src/services/cache.service.ts (TO BUILD)
interface CachedConversationState {
  conversation_id: string;
  messages: Message[];        // last 10 messages
  context: ExtractedContext;  // latest extracted context
  qualification_score: number;
  ttl: number;               // 30 minutes
}

class CacheService {
  async getConversationState(phone: string, dealershipId: string): Promise<CachedConversationState | null>;
  async setConversationState(key: string, state: CachedConversationState): Promise<void>;
  async invalidate(key: string): Promise<void>;
}
```

Cache key: `conv:{dealership_id}:{customer_phone}`
TTL: 30 minutes (conversations are typically 5-15 minutes)
Write-through: Update cache on every message, write to DB async via queue.

### 3.2 CRM Abstraction Layer (Already Implemented)

```typescript
// src/types/crm.ts — THE INTERFACE
interface CRMAdapter {
  createContact(contact: ContactData): Promise<string>;
  updateContact(crmContactId: string, updates: Partial<ContactData>): Promise<void>;
  logInteraction(crmContactId: string, interaction: InteractionLog): Promise<void>;
  bookAppointment(crmContactId: string, appointment: AppointmentData): Promise<string>;
}

// src/services/crm/crm.adapter.ts — THE FACTORY
class CRMFactory {
  static create(crmType: string, config: CRMConfig): CRMAdapter {
    switch (crmType) {
      case 'gohighlevel': return new GoHighLevelAdapter(config);
      // Future:
      // case 'dealersocket': return new DealerSocketAdapter(config);
      // case 'vinsolutions': return new VinSolutionsAdapter(config);
      default: throw new Error(`Unsupported CRM type: ${crmType}`);
    }
  }
}
```

**Adding a new CRM:** Implement `CRMAdapter` interface. Add to factory switch. Configure `crm_type` + `crm_config` on dealership row. Zero changes to agent logic.

### 3.3 Prompt Versioning (Schema Built, Runtime TO BUILD)

**Database table exists** (`agent_prompts`):

```sql
CREATE TABLE agent_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  response_guidelines JSONB NOT NULL,  -- {"max_length": 160, "tone": "friendly"}
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100)
);
```

**Runtime integration (TO BUILD in Phase 5):**

```typescript
// src/services/prompt.service.ts
class PromptService {
  async getActivePrompt(): Promise<AgentPrompt> {
    // Check Redis cache first (TTL 5 min)
    // Fallback to DB query: WHERE active = true ORDER BY created_at DESC LIMIT 1
    // Fallback to DEFAULT_SYSTEM_PROMPT constant
  }

  async getPromptForABTest(conversationId: string): Promise<AgentPrompt> {
    // Hash conversation_id to deterministically assign A or B variant
    // 50/50 split by default, configurable per dealership
  }
}
```

### 3.4 Error Handling and Fallbacks (Already Implemented)

**Anthropic failure chain:**
1. Retry 3x with exponential backoff (1s, 2s, 4s)
2. 429 (rate limit): back off and retry
3. 400/401 (auth): throw immediately (non-retryable)
4. After 3 failures: return hardcoded fallback response based on keyword matching

**Fallback responses (from `anthropic.service.ts`):**
- Price questions → "I'd love to help with pricing! What vehicle are you interested in?"
- Test drive → "I can help schedule a test drive! What day works best?"
- Trade-in → "We'd be happy to look at your trade-in! What are you currently driving?"
- Default → "Thanks for reaching out! I'm here to help you find the perfect vehicle."

**SMS failure chain:**
1. Retry 3x with exponential backoff
2. Log interaction as failed with error message
3. Throw `SMSError` (non-retryable after 3 attempts)

**GHL CRM failure chain:**
1. Retry 3x with exponential backoff
2. 429: extended backoff (2s, 4s, 8s)
3. 401: throw immediately
4. After 3 failures: throw `ServiceError`

---

## 4. THE BUILD PHASES (12 Weeks)

### Phase 1 (Weeks 1-3): Core Agent + SMS ✅ COMPLETE

**What was built:**
- Express server with helmet, CORS, rate limiting
- Twilio + Bandwidth SMS adapters with factory pattern
- Anthropic Claude integration with retry/fallback
- Conversation management (create, messages, status)
- Escalation engine (keyword, frustration, repetition, complex topics)
- Lead qualification scoring
- Context extraction (regex-based vehicle/budget/timeline/trade-in)
- GoHighLevel CRM adapter
- Admin dashboard API
- Database schema (7 migrations)
- Unit test suite
- Docker Compose for local dev
- Render deployment config

**Test coverage:** Unit tests for agent, CRM, SMS, escalation, qualification.

---

### Phase 2 (Weeks 4-6): CRM Integration Pipeline + Booking — IN PROGRESS

**What gets built:**

| Module | File | Description |
|--------|------|-------------|
| BullMQ queue setup | `src/config/queue.ts` | Queue initialization, worker config |
| CRM sync worker | `src/workers/crm-sync.worker.ts` | Auto-create GHL contact on first message |
| Test drive booking service | `src/services/booking.service.ts` | Parse dates, check availability, book |
| Google Calendar integration | `src/services/calendar/google.adapter.ts` | OAuth2, create events, check slots |
| Calendar adapter interface | `src/types/calendar.ts` | Abstract interface for calendar providers |
| Booking route | `src/routes/booking.routes.ts` | `POST /api/agent/book-test-drive` |
| Agent booking detection | Update `src/services/agent.service.ts` | Detect booking intent in AI response |

**Dependencies on Phase 1:** All Phase 1 services, database tables, CRM adapter.

**New files:**

```
src/
├─ config/
│  └─ queue.ts                    # BullMQ connection + queue definitions
├─ workers/
│  ├─ crm-sync.worker.ts          # Contact creation/update worker
│  ├─ booking.worker.ts           # Test drive booking worker
│  └─ notification.worker.ts      # Manager alert worker
├─ services/
│  ├─ booking.service.ts           # Booking orchestration
│  └─ calendar/
│     ├─ calendar.adapter.ts       # Abstract interface
│     └─ google.adapter.ts         # Google Calendar implementation
├─ types/
│  └─ calendar.ts                  # CalendarAdapter, TimeSlot, BookingRequest
└─ routes/
   └─ booking.routes.ts            # Booking API endpoints
```

**New migration:**

```sql
-- migrations/008_create_bookings.sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  dealership_id UUID NOT NULL REFERENCES dealerships(id),
  customer_phone VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255),
  vehicle_interest VARCHAR(255),
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  booking_end_time TIME NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Phoenix',
  calendar_event_id VARCHAR(255),        -- Google Calendar event ID
  crm_appointment_id VARCHAR(255),       -- GHL appointment ID
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',  -- confirmed, cancelled, completed, no_show
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_conversation ON bookings(conversation_id);
CREATE INDEX idx_bookings_dealership_date ON bookings(dealership_id, booking_date);
CREATE INDEX idx_bookings_status ON bookings(status, booking_date);
```

**Key function signatures:**

```typescript
// src/services/booking.service.ts
class BookingService {
  async detectBookingIntent(messages: Message[]): Promise<{
    wantsBooking: boolean;
    preferredDate?: string;   // parsed from "this Saturday", "tomorrow", etc.
    preferredTime?: string;
    vehicle?: string;
  }>;

  async getAvailableSlots(dealershipId: string, date: string): Promise<TimeSlot[]>;

  async bookTestDrive(request: BookingRequest): Promise<BookingResult>;
  // 1. Check calendar availability
  // 2. Create Google Calendar event
  // 3. Create GHL appointment
  // 4. Insert bookings row
  // 5. Return confirmation
}

// src/types/calendar.ts
interface CalendarAdapter {
  getAvailableSlots(calendarId: string, date: string, timezone: string): Promise<TimeSlot[]>;
  createEvent(calendarId: string, event: CalendarEvent): Promise<string>;
  cancelEvent(calendarId: string, eventId: string): Promise<void>;
}

interface TimeSlot {
  start: string;  // ISO 8601
  end: string;
  available: boolean;
}

interface BookingRequest {
  conversation_id: string;
  dealership_id: string;
  customer_phone: string;
  customer_name?: string;
  vehicle: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  timezone: string;
}

interface BookingResult {
  success: boolean;
  booking_id?: string;
  calendar_event_id?: string;
  crm_appointment_id?: string;
  confirmation_message: string;
  error?: string;
}
```

**Testing approach:**
- Unit: Mock Google Calendar API, mock GHL bookAppointment
- Integration: End-to-end booking flow with test calendar
- Edge cases: Double-booking prevention, timezone handling, past-date rejection

**Success criteria:**
- Customer says "I want to test drive a Camry Saturday at 10am"
- Agent detects intent, checks availability, books, confirms via SMS
- GHL appointment created, Google Calendar event created, bookings row inserted

**Risk assessment:**
- Google Calendar OAuth2 token refresh is finicky — need robust token management
- Date parsing from natural language ("next Tuesday", "this weekend") — use `chrono-node` library
- GHL calendar ID must be configured per dealership — add to `crm_config` JSONB

---

### Phase 3 (Weeks 7-8): Routing + Escalation Enhancement

**What gets built:**

| Module | File | Description |
|--------|------|-------------|
| Smart routing engine | `src/services/routing.service.ts` | Route escalations to specific salespeople |
| Notification worker | `src/workers/notification.worker.ts` | SMS/email alerts to managers |
| Escalation dashboard data | Update `src/routes/admin.routes.ts` | Escalation metrics, queue status |
| Dealership user management | `migrations/009_create_dealership_users.sql` | Staff roles + routing preferences |

**New migration:**

```sql
-- migrations/009_create_dealership_users.sql
CREATE TABLE dealership_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id UUID NOT NULL REFERENCES dealerships(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'salesperson',  -- salesperson, manager, bdc, owner
  receives_escalations BOOLEAN NOT NULL DEFAULT FALSE,
  receives_high_score_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  alert_threshold INTEGER DEFAULT 70,  -- qualification score threshold for alerts
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealership_users_dealership ON dealership_users(dealership_id, active);
CREATE INDEX idx_dealership_users_escalation ON dealership_users(dealership_id, receives_escalations, active);
```

**Routing logic:**

```typescript
// src/services/routing.service.ts
class RoutingService {
  async routeEscalation(conversationId: string, dealershipId: string, reason: string): Promise<{
    assignedTo: DealershipUser;
    notificationSent: boolean;
  }> {
    // 1. Get active users who receive escalations
    // 2. Round-robin or least-recent-assignment
    // 3. Queue notification (SMS + optional email)
    // 4. Log routing decision
  }

  async routeHighScoreLead(conversationId: string, dealershipId: string, score: number): Promise<void> {
    // 1. Get users with alert_threshold <= score
    // 2. Notify via SMS: "Hot lead! {phone} scored {score}. Vehicle: {interest}"
  }
}
```

**Success criteria:**
- Escalation triggers SMS to on-duty manager within 30 seconds
- High-score leads (70+) trigger alert to configured salespeople
- Admin dashboard shows escalation queue with assignment status

---

### Phase 4 (Week 9): Multi-Channel

**What gets built:**

| Module | File | Description |
|--------|------|-------------|
| Email channel adapter | `src/services/email/sendgrid.adapter.ts` | Inbound/outbound email via SendGrid |
| Email webhook route | `src/routes/email.routes.ts` | SendGrid inbound parse webhook |
| Web chat adapter | `src/services/webchat/webchat.adapter.ts` | WebSocket-based web chat |
| Channel factory | `src/services/channel.factory.ts` | Abstract outbound channel selection |

**Channel abstraction:**

```typescript
// src/services/channel.factory.ts
interface ChannelAdapter {
  send(to: string, from: string, message: string): Promise<void>;
}

class ChannelFactory {
  static create(channel: 'sms' | 'email' | 'web', dealership: Dealership): ChannelAdapter {
    switch (channel) {
      case 'sms': return SMSFactory.create(dealership.sms_provider, dealership.sms_config);
      case 'email': return new SendGridAdapter(dealership);
      case 'web': return new WebChatAdapter(dealership);
    }
  }
}
```

**Impact on agent.service.ts:** Replace direct `this.twilio.sendSMS()` call with `ChannelFactory.create(channel, dealership).send()`.

**Success criteria:**
- Agent responds via same channel customer used
- Email conversations maintain same context as SMS
- Web chat provides real-time responses via WebSocket

---

### Phase 5 (Weeks 10-11): Training + Optimization

**What gets built:**

| Module | File | Description |
|--------|------|-------------|
| Redis conversation cache | `src/services/cache.service.ts` | Sub-100ms state retrieval |
| Prompt A/B testing runtime | `src/services/prompt.service.ts` | Load versioned prompts, track performance |
| Token usage tracking | `src/services/analytics.service.ts` | Per-conversation cost tracking |
| Response quality metrics | `migrations/010_create_prompt_metrics.sql` | Track which prompts perform better |

**New migration:**

```sql
-- migrations/010_create_prompt_metrics.sql
CREATE TABLE prompt_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version VARCHAR(20) NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  response_time_ms INTEGER,
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  qualification_score_delta INTEGER,  -- score change after this response
  escalated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_metrics_version ON prompt_metrics(prompt_version, created_at);
```

**Success criteria:**
- Average response time < 2 seconds (DB + AI + SMS)
- Redis cache hit rate > 80% for active conversations
- Prompt A/B test data visible in admin dashboard

---

### Phase 6 (Week 12): Production Hardening

**What gets built:**

| Module | File | Description |
|--------|------|-------------|
| CI/CD pipeline | `.github/workflows/ci.yml` | Lint, test, build, deploy |
| Sentry integration | Update `src/index.ts` | Error tracking + performance monitoring |
| Health check improvements | Update `src/routes/admin.routes.ts` | Deep health checks (DB, Redis, Anthropic, Twilio) |
| Rate limiting per dealership | Update `src/middleware/auth.ts` | Per-API-key rate limits |
| Conversation cleanup job | `src/workers/cleanup.worker.ts` | Close stale conversations after 24h |

**CI/CD pipeline:**

```yaml
# .github/workflows/ci.yml
name: CI/CD
on:
  push:
    branches: [main, 'feat/*', 'fix/*']
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: shiftly_test
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: cd ai-agent-backend && npm ci
      - run: cd ai-agent-backend && npm run lint
      - run: cd ai-agent-backend && npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/shiftly_test
          REDIS_URL: redis://localhost:6379
          ANTHROPIC_API_KEY: test-key
          NODE_ENV: test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Render
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

**Monitoring — what metrics matter:**

| Metric | Alert Threshold | Why |
|--------|----------------|-----|
| Response time (p95) | > 5 seconds | Customer waiting too long |
| Anthropic API errors | > 5% of requests | AI brain is down |
| SMS delivery failures | > 2% of sends | Messages not reaching customers |
| Escalation rate | > 25% of conversations | Agent not handling well |
| Qualification score avg | < 30 | Agent not extracting info |
| DB connection pool utilization | > 80% | Scale DB or optimize queries |
| Redis memory usage | > 80% | Eviction risk |
| Queue job failures | > 10 in 5 min | Worker issue |

**Alerts that wake us up at 2 AM:**
1. Health endpoint returns non-200 for 3+ consecutive checks
2. Anthropic API returns 5xx for 5+ minutes
3. SMS delivery rate drops below 90%
4. Database connection pool exhausted
5. Redis disconnected

**Rollback procedure:**
1. Render: Click "Manual Deploy" → select previous commit
2. Database: Migrations are additive-only (no destructive changes). If needed, run reverse migration SQL manually.
3. Emergency: Render dashboard → "Suspend Service" → investigate → redeploy last known good

---

## 5. API ENDPOINTS

### POST /webhook/sms (Legacy — auto-detects Twilio)

Already built. Twilio form-encoded webhook.

### POST /webhook/sms/twilio

Already built. Explicit Twilio webhook.

### POST /webhook/sms/bandwidth

Already built. Explicit Bandwidth JSON webhook.

### POST /api/agent/handle-message

Already built.

**Request:**
```json
{
  "customer_phone": "+14805551234",
  "dealership_id": "00000000-0000-0000-0000-000000000001",
  "message": "I'm looking for a used Camry under $25k",
  "channel": "sms"
}
```

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

**Response (escalated):**
```json
{
  "success": true,
  "conversation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "response": "I understand your concern. Let me connect you with one of our team members who can help you directly. Someone will reach out to you shortly!",
  "action_taken": "escalated",
  "qualification_score": 45
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "String must contain at least 10 character(s)"
}
```

### GET /api/agent/conversation/:customerId

Already built. Requires `dealership_id` query param.

**Request:** `GET /api/agent/conversation/+14805551234?dealership_id=00000000-0000-0000-0000-000000000001`

**Response (200):**
```json
{
  "success": true,
  "conversation": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "customer_phone": "+14805551234",
    "dealership_id": "00000000-0000-0000-0000-000000000001",
    "status": "active",
    "qualification_score": 65,
    "created_at": "2026-02-06T10:00:00Z",
    "updated_at": "2026-02-06T10:05:00Z",
    "last_message_at": "2026-02-06T10:05:00Z",
    "messages": [
      {
        "id": "msg-1",
        "conversation_id": "a1b2c3d4",
        "role": "customer",
        "content": "I'm looking for a used Camry under $25k",
        "metadata": null,
        "created_at": "2026-02-06T10:00:00Z"
      },
      {
        "id": "msg-2",
        "conversation_id": "a1b2c3d4",
        "role": "agent",
        "content": "Great choice! The Camry is super popular. Are you looking for a specific year range?",
        "metadata": { "tokens_used": { "prompt": 150, "completion": 25 }, "model_version": "claude-3-5-haiku-latest" },
        "created_at": "2026-02-06T10:00:01Z"
      }
    ]
  }
}
```

### POST /api/agent/book-test-drive (TO BUILD — Phase 2)

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

**Error (409 — time slot taken):**
```json
{
  "success": false,
  "error": "Time slot not available",
  "available_slots": [
    { "start": "2026-02-08T11:00:00-07:00", "end": "2026-02-08T12:00:00-07:00" },
    { "start": "2026-02-08T13:00:00-07:00", "end": "2026-02-08T14:00:00-07:00" }
  ]
}
```

### POST /api/agent/escalate (TO BUILD — Phase 3)

**Request:**
```json
{
  "conversation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "reason": "Customer requesting manager",
  "priority": "high"
}
```

**Response (200):**
```json
{
  "success": true,
  "assigned_to": {
    "id": "user-123",
    "name": "Mike Johnson",
    "role": "manager",
    "phone": "+14805559999"
  },
  "notification_sent": true
}
```

### GET /api/admin/dashboard

Already built. Requires `dealership_id` query param.

**Response (200):**
```json
{
  "success": true,
  "metrics": {
    "total_conversations": 342,
    "active_conversations": 18,
    "avg_qualification_score": 47.3,
    "total_messages": 2841,
    "interactions": [
      { "interaction_type": "message_sent", "count": "2100", "successful": "2095" },
      { "interaction_type": "sms_received", "count": "1200", "successful": "1200" },
      { "interaction_type": "sms_send", "count": "900", "successful": "885" },
      { "interaction_type": "escalation", "count": "42", "successful": "42" }
    ]
  }
}
```

### GET /api/admin/health

Already built.

**Response (200):**
```json
{
  "status": "healthy",
  "database": { "status": "healthy" },
  "redis": { "status": "healthy" },
  "timestamp": "2026-02-06T10:00:00Z"
}
```

---

## 6. DATABASE SCHEMA (Complete)

### Current Tables (Already Migrated)

```sql
-- 001: dealerships
CREATE TABLE dealerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Phoenix',
  crm_type VARCHAR(50),
  crm_config JSONB,
  agent_config JSONB DEFAULT '{"qualification_threshold": 60, "escalation_keywords": [...]}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Added by migration 007:
  sms_provider VARCHAR(20) DEFAULT 'twilio',
  sms_config JSONB,
  phone_ownership VARCHAR(20) DEFAULT 'new'
);

-- 002: conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone VARCHAR(20) NOT NULL,
  dealership_id UUID NOT NULL REFERENCES dealerships(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, escalated, closed
  qualification_score INTEGER,
  last_message_at TIMESTAMPTZ
);
-- Indexes: (customer_phone, dealership_id), (dealership_id, status), (updated_at DESC)

-- 003: messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,  -- customer, agent, human
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Index: (conversation_id, created_at)

-- 004: customer_context
CREATE TABLE customer_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  context_type VARCHAR(50) NOT NULL,  -- vehicle_interest, budget, timeline, trade_in
  context_value JSONB NOT NULL,
  confidence NUMERIC(3,2),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, context_type)
);
-- Index: (conversation_id, context_type)

-- 005: agent_prompts
CREATE TABLE agent_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  response_guidelines JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100)
);
-- Index: (active, version)

-- 006: interactions
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Indexes: (conversation_id, interaction_type, created_at), (interaction_type, success)
```

### Planned Tables (Phase 2-3)

```sql
-- 008: bookings (Phase 2)
-- See Phase 2 section above

-- 009: dealership_users (Phase 3)
-- See Phase 3 section above

-- 010: prompt_metrics (Phase 5)
-- See Phase 5 section above
```

### Key Queries

**Get active conversation for customer:**
```sql
SELECT * FROM conversations
WHERE customer_phone = $1 AND dealership_id = $2 AND status = 'active'
ORDER BY updated_at DESC LIMIT 1;
```

**Get conversation history (last 20 messages):**
```sql
SELECT * FROM messages
WHERE conversation_id = $1
ORDER BY created_at ASC LIMIT 20;
```

**Dashboard metrics:**
```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  AVG(qualification_score) FILTER (WHERE qualification_score IS NOT NULL) as avg_score
FROM conversations WHERE dealership_id = $1;
```

**Slow query protection:** Already implemented — queries > 1000ms trigger a warning log.

---

## 7. INTEGRATION DETAILS

### 7.1 Twilio (SMS)

**Auth:** Account SID + Auth Token (per-dealership or global fallback)
**Webhook:** `POST /webhook/sms/twilio` — Twilio sends form-encoded POST
**Validation:** `twilio.validateRequest(authToken, signature, url, body)` — timing-safe comparison
**Send:** `client.messages.create({ to, from, body })`
**Retry:** 3x exponential backoff (1s, 2s, 4s)
**Error handling:** `SMSError` class, logs interaction success/failure to `interactions` table
**Config per dealership:** `sms_config` JSONB on `dealerships` table overrides global env vars

### 7.2 Bandwidth (SMS)

**Auth:** API Token + Secret (Basic Auth)
**Webhook:** `POST /webhook/sms/bandwidth` — JSON payload
**Validation:** HMAC-SHA256 of `{timestamp}.{payload}` against `x-bandwidth-signature`
**Send:** `controller.createMessage(accountId, { applicationId, to, from, text })`
**Retry:** 3x exponential backoff
**Error handling:** Same pattern as Twilio

### 7.3 GoHighLevel (CRM)

**Auth:** Bearer token (`apiKey` in `crm_config`)
**Base URL:** `https://services.leadconnectorhq.com`
**API version header:** `Version: 2021-07-28`

**Operations (already implemented):**
- `POST /contacts/` — create contact (phone, name, email, source: "Shiftly AI Agent")
- `PUT /contacts/{id}` — update contact
- `POST /contacts/{id}/notes` — log interaction as note
- `POST /calendars/events/appointments` — book test drive appointment

**Retry:** 3x, extended backoff on 429 (2s, 4s, 8s)
**Error handling:** 401 = throw immediately. 429 = backoff. 5xx = retry.

**Known issues:**
- GHL rate limits are aggressive (undocumented). Our 3x retry with exponential backoff handles this.
- GHL API occasionally returns 200 with error body. Need to check response structure, not just HTTP status.
- Calendar ID must be configured per dealership — not auto-discoverable.

### 7.4 Google Calendar (TO BUILD — Phase 2)

**Auth:** OAuth2 service account (dealership grants calendar access)
**Operations:**
- `GET /calendars/{id}/freebusy` — check availability
- `POST /calendars/{id}/events` — create test drive event
- `DELETE /calendars/{id}/events/{eventId}` — cancel

**Token management:** Store refresh token in `crm_config` JSONB. Auto-refresh access token (expires every hour). Cache access token in Redis (TTL 50 min).

### 7.5 Anthropic (AI Engine)

**Auth:** API key in `ANTHROPIC_API_KEY`
**Model:** `claude-3-5-haiku-latest` (fast, cheap, SMS-optimized)
**Config:**
- `temperature: 0.7` — creative enough for natural conversation, not hallucination-prone
- `max_tokens: 200` — keeps responses SMS-length
- Last 10 messages as context window (enough for conversation continuity, controls costs)

**System prompt (current v1.0):**
```
You are a friendly, professional car dealership assistant named Shiftly.
Keep responses under 160 characters (SMS length).
Ask one question at a time.
Never give exact prices — say "I can get you exact pricing" and offer to connect them.
Never make up vehicle availability or specs.
If frustrated, offer human connection.
Extract: vehicle interest, budget range, timeline, trade-in info.
When ready, offer to schedule a test drive.
TONE: Friendly, helpful, not pushy. Like a knowledgeable friend at the dealership.
```

**Cost estimate:**
- Average conversation: 8 messages = ~2,000 input tokens, ~400 output tokens
- Cost per conversation: ~$0.001 (Haiku pricing)
- 1,000 conversations/day = ~$1/day in AI costs

### 7.6 SendGrid (TO BUILD — Phase 4)

**Auth:** API key
**Inbound:** SendGrid Inbound Parse webhook → `POST /webhook/email`
**Outbound:** `POST /v3/mail/send` — send email responses
**Template:** Dynamic template for branded dealership emails

---

## 8. DEPLOYMENT & MONITORING

### Current Deployment (Render)

**Infrastructure (from `render.yaml`):**
- PostgreSQL 15 (basic-256mb plan)
- Redis 7 (starter plan)
- Node.js web service (starter plan, Oregon region)
- Auto-deploy from GitHub `main` branch

**Build:** `npm ci --include=dev && npm run build`
**Start:** `npm run start`

### CI/CD Pipeline (TO BUILD — Phase 6)

See Phase 6 section for full GitHub Actions config.

**Flow:** PR → lint + test → merge to main → auto-deploy to Render

### Staging vs. Production

| Config | Staging | Production |
|--------|---------|------------|
| `NODE_ENV` | `staging` | `production` |
| Database | Separate Render Postgres instance | Main Render Postgres |
| Redis | Shared (key-prefixed) | Dedicated |
| Anthropic | Same API key, rate-limited | Same API key |
| Twilio | Test phone numbers | Production numbers |
| Webhook URL | `https://staging.api.shiftly.ai` | `https://api.shiftly.ai` |
| Log level | `debug` | `info` |

### Monitoring Stack

**Already implemented:**
- Winston structured logging (JSON in production, colorized in dev)
- DB slow query warnings (> 1000ms)
- Health endpoint (`/health`, `/api/admin/health`)

**To implement (Phase 6):**
- Sentry for error tracking
- Custom metrics (response time, token usage, queue depth)
- Uptime monitoring (Render built-in + external like UptimeRobot)

---

## 9. THE HARDEST PROBLEMS

### 9.1 CRM API Integrations

**Why it's terrible:** GHL's API documentation is incomplete. Rate limits are undocumented and change. OAuth token refresh has edge cases. Contact deduplication logic is server-side and opaque.

**Mitigation:**
- Aggressive retry with exponential backoff (already implemented)
- Log every CRM API call with full request/response for debugging
- CRM operations are async (queue-based) so failures don't block SMS response
- Fallback: If CRM fails, conversation continues. Contact creation retried later.
- Store CRM responses in `interactions` table for debugging

### 9.2 Agent Hallucination

**The risk:** AI invents vehicle prices, availability, features, or dealership policies that are wrong.

**Mitigation (already partially implemented):**
- System prompt explicitly says: "Never give exact prices", "Never make up vehicle availability"
- `max_tokens: 200` limits response length (less room for hallucination)
- `temperature: 0.7` balances creativity vs. accuracy

**Additional mitigation (Phase 5):**
- Post-processing filter: scan AI response for dollar amounts, specific inventory claims
- Dealership-specific guardrails in `agent_config` JSONB (allowed/disallowed topics)
- Response review queue for new dealership onboarding (first 50 conversations reviewed by human)

### 9.3 Scaling to 1,000+ Concurrent Conversations

**Current bottleneck:** Each message = 3-4 synchronous DB queries + 1 Anthropic API call + 1 SMS send.

**Mitigation path:**
1. **Phase 2:** BullMQ queues make CRM/analytics async (don't block response)
2. **Phase 5:** Redis conversation cache eliminates 2-3 DB queries per message
3. **Infrastructure:** Render auto-scaling. Postgres connection pool = 20 (can increase).
4. **Anthropic:** Haiku model handles high throughput. Rate limits are generous.
5. **Target:** Sub-3-second end-to-end (message received → SMS sent)

### 9.4 Keeping API Costs Reasonable

**Cost drivers:** Anthropic tokens, Twilio SMS ($0.0079/segment), Redis, Postgres.

**Current cost model per conversation (8 messages avg):**
- Anthropic: ~$0.001
- Twilio: ~$0.06 (4 outbound SMS × $0.0079 + 4 inbound × $0.0075)
- Infrastructure: ~$0.002

**Total per conversation: ~$0.06** (SMS dominates, not AI)

**Mitigation:**
- Haiku is already the cheapest model that's good enough
- 10-message context window limits token growth
- Bandwidth carrier integration could reduce SMS costs for some dealerships
- Batch API for non-urgent operations (analytics, CRM sync)

### 9.5 Getting Tone/Personality Right

**The risk:** Too formal = feels like a bot. Too casual = unprofessional. Wrong for demographic.

**Mitigation:**
- Prompt versioning table (already built) supports A/B testing
- `response_guidelines` JSONB allows per-prompt tone tuning
- Per-dealership agent personality via `agent_config` (future)
- Prompt metrics table (Phase 5) tracks qualification score correlation with prompt version
- Human review of first 50 conversations per dealership during onboarding

---

## 10. WEEK-BY-WEEK MILESTONES

### Weeks 1-3: ✅ COMPLETE
See Phase 1 summary.

### Week 4
- **Code:** `src/config/queue.ts`, `src/workers/crm-sync.worker.ts`
- **Test:** BullMQ worker processes jobs, GHL contact created on first message
- **Demo:** Show CRM contact auto-creation flow
- **Risk:** GHL API rate limits during bulk testing

### Week 5
- **Code:** `src/services/booking.service.ts`, `src/services/calendar/google.adapter.ts`
- **Test:** Google Calendar OAuth flow, slot availability check, event creation
- **Demo:** Book a test drive via API endpoint
- **Risk:** Google OAuth2 service account setup complexity

### Week 6
- **Code:** `src/workers/booking.worker.ts`, integrate booking into agent flow
- **Test:** End-to-end: customer says "test drive Saturday 10am" → booking confirmed via SMS
- **Demo:** Full booking flow to dealership stakeholder
- **Risk:** Natural language date parsing edge cases

### Week 7
- **Code:** `migrations/009_create_dealership_users.sql`, `src/services/routing.service.ts`
- **Test:** Escalation routing assigns to correct user, notification sent
- **Demo:** Escalation → manager gets SMS alert within 30 seconds
- **Risk:** Round-robin logic for multiple salespeople

### Week 8
- **Code:** `src/workers/notification.worker.ts`, admin dashboard escalation metrics
- **Test:** High-score lead alerts, escalation queue visibility
- **Demo:** Admin dashboard shows real-time escalation queue
- **Risk:** Notification fatigue (too many alerts)

### Week 9
- **Code:** Email adapter + webhook, web chat adapter
- **Test:** Email conversation maintains context, web chat real-time responses
- **Demo:** Multi-channel demo (SMS + email for same customer)
- **Risk:** Email parsing (messy HTML, signatures, reply chains)

### Week 10
- **Code:** Redis cache service, prompt service with A/B testing
- **Test:** Cache hit rate > 80%, prompt variants assigned deterministically
- **Demo:** Response time improvement metrics
- **Risk:** Cache invalidation bugs

### Week 11
- **Code:** Analytics service, token tracking, prompt metrics
- **Test:** Per-conversation cost visible, prompt performance comparison
- **Demo:** Cost dashboard + prompt performance report
- **Risk:** Metrics overhead impacting response time

### Week 12
- **Code:** CI/CD, Sentry, rate limiting, cleanup worker
- **Test:** Full CI pipeline green, Sentry captures test errors
- **Demo:** Production-ready deployment with monitoring
- **Risk:** Migration to production environment edge cases

---

## 11. HANDOFF TO NEXT PHASE

### For the Next Engineer (or Claude Code)

**Start here:**
1. Clone the repo: `git clone <repo-url>`
2. Copy `.env.local.example` to `.env`
3. Run `docker-compose up -d` (starts Postgres + Redis)
4. Run `npm install`
5. Run `npm run migrate` (applies all migrations)
6. Run `npm run dev` (starts server with nodemon)
7. Run `npm test` (verify everything passes)

### File Structure (Current)

```
ai-agent-backend/
├─ src/
│  ├─ index.ts                          # Express app + startup
│  ├─ types/
│  │  ├─ conversation.ts                 # Conversation, Message, CustomerContext, ConversationState
│  │  ├─ agent.ts                        # AgentDecision, AgentResponse, IncomingMessage
│  │  └─ crm.ts                          # CRMAdapter interface, ContactData, AppointmentData
│  ├─ routes/
│  │  ├─ webhook.routes.ts               # /webhook/sms, /webhook/sms/twilio, /webhook/sms/bandwidth
│  │  ├─ agent.routes.ts                 # /api/agent/handle-message, /api/agent/conversation/:id
│  │  └─ admin.routes.ts                 # /api/admin/health, /api/admin/dashboard
│  ├─ services/
│  │  ├─ agent.service.ts                # Core pipeline: message → AI → response → SMS
│  │  ├─ anthropic.service.ts            # Claude 3.5 Haiku integration
│  │  ├─ twilio.service.ts               # Legacy direct Twilio (used by agent.service)
│  │  ├─ database.service.ts             # All Postgres queries
│  │  ├─ qualification.service.ts        # Lead scoring (0-100)
│  │  ├─ context.service.ts              # Regex-based context extraction
│  │  ├─ escalation.service.ts           # Escalation decision engine
│  │  ├─ crm/
│  │  │  ├─ crm.adapter.ts              # CRMFactory
│  │  │  └─ ghl.adapter.ts              # GoHighLevel implementation
│  │  └─ sms/
│  │     ├─ sms.adapter.ts              # SMSAdapter interface
│  │     ├─ sms.factory.ts              # SMSFactory
│  │     ├─ twilio.adapter.ts           # Twilio SMS implementation
│  │     └─ bandwidth.adapter.ts        # Bandwidth SMS implementation
│  ├─ middleware/
│  │  ├─ auth.ts                         # API key validation (skips webhooks + health)
│  │  └─ errorHandler.ts                 # Global error handler
│  ├─ utils/
│  │  ├─ logger.ts                       # Winston logger
│  │  └─ errors.ts                       # ServiceError, ValidationError, SMSError
│  └─ config/
│     ├─ database.ts                     # pg Pool + query helper
│     ├─ redis.ts                        # Redis client + health check
│     ├─ env.ts                          # Zod-validated environment variables
│     └─ migrate.ts                      # Migration runner
├─ migrations/
│  ├─ 001_create_dealerships.sql
│  ├─ 002_create_conversations.sql
│  ├─ 003_create_messages.sql
│  ├─ 004_create_customer_context.sql
│  ├─ 005_create_agent_prompts.sql
│  ├─ 006_create_interactions.sql
│  └─ 007_add_sms_provider.sql
├─ tests/
│  ├─ agent.test.ts                      # Anthropic service unit tests
│  ├─ integration.test.ts               # (placeholder)
│  └─ unit/
│     ├─ qualification.test.ts
│     ├─ escalation.test.ts
│     ├─ crm.test.ts
│     └─ sms.test.ts
├─ docker-compose.yml
├─ render.yaml
├─ .env.example
├─ .env.local.example
├─ package.json
├─ tsconfig.json
└─ README.md
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `booking.service.ts` |
| Classes | PascalCase | `BookingService` |
| Interfaces | PascalCase | `BookingRequest` |
| Functions | camelCase | `detectBookingIntent()` |
| Constants | UPPER_SNAKE | `DEFAULT_MODEL` |
| Database tables | snake_case | `customer_context` |
| Database columns | snake_case | `qualification_score` |
| API routes | kebab-case | `/api/agent/handle-message` |
| Environment vars | UPPER_SNAKE | `ANTHROPIC_API_KEY` |
| Migrations | sequential prefix | `008_create_bookings.sql` |

### Testing Requirements

| Test Type | Tool | When |
|-----------|------|------|
| Unit | Jest + ts-jest | Every service, every PR |
| Integration | Jest + test DB | Before merge to main |
| Mocking | jest.fn(), jest.mock() | External APIs (Anthropic, Twilio, GHL) |
| Coverage target | 70%+ on services | Phase 6 |

### Branch Strategy

```
main ← production deploys
  ├─ feat/booking-service
  ├─ feat/google-calendar
  ├─ feat/bullmq-queues
  ├─ fix/ghl-rate-limit-handling
  └─ chore/ci-cd-pipeline
```

### The Immediate Next Task (Phase 2, Week 4)

**Build the BullMQ queue infrastructure and CRM sync worker.**

1. Install: `npm install bullmq`
2. Create `src/config/queue.ts` — queue definitions + connection
3. Create `src/workers/crm-sync.worker.ts` — on new conversation, create GHL contact
4. Update `src/services/agent.service.ts` — after `findOrCreateConversation`, enqueue CRM sync
5. Test: New SMS → conversation created → GHL contact created async
6. Verify: No increase in response time (CRM sync is async)

---

*This document is the single source of truth for the AI Agent backend. Update it when architecture decisions change.*
