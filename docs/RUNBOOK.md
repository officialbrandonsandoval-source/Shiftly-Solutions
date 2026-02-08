# Shiftly AI Agent — Operations Runbook

## Alert Response Procedures

### 1. Health Endpoint Returning Non-200

**Severity:** P1 — Service down

**Diagnosis:**
1. Check Render dashboard for service status
2. Check Render logs for crash/restart loops
3. Verify PostgreSQL and Redis are healthy

**Resolution:**
- If DB connection issue: Check `DATABASE_URL` env var, verify Render Postgres is running
- If Redis connection issue: Check `REDIS_URL`, verify Render Redis is running
- If crash loop: Check recent deploys, rollback if needed (see Rollback section)

---

### 2. Anthropic API Errors > 5%

**Severity:** P1 — AI brain down

**Diagnosis:**
1. Check [Anthropic Status Page](https://status.anthropic.com)
2. Check Sentry for error details
3. Look for rate limit (429) vs. server errors (5xx)

**Resolution:**
- Rate limited: Check for traffic spike, reduce request rate
- API key issue: Verify `ANTHROPIC_API_KEY` is valid
- Anthropic outage: Wait for resolution, the system gracefully escalates when AI is unavailable

---

### 3. SMS Delivery Rate < 90%

**Severity:** P2 — Messages not reaching customers

**Diagnosis:**
1. Check Twilio/Bandwidth dashboard for delivery errors
2. Look for specific error codes in logs
3. Check if phone numbers are being blocked/flagged

**Resolution:**
- Twilio suspension: Contact Twilio support
- Number flagged: Register for A2P 10DLC compliance
- Provider outage: Switch to backup SMS provider if configured

---

### 4. Database Connection Pool Exhausted

**Severity:** P1 — Service degraded

**Diagnosis:**
1. Check `pg` pool stats in logs (slow query warnings)
2. Look for long-running queries
3. Check connection count vs. pool max

**Resolution:**
- Kill long-running queries: Connect via psql, `SELECT pg_terminate_backend(pid)`
- Increase pool size: Update database config (restart required)
- Scale DB: Upgrade Render Postgres plan

---

### 5. Queue Job Failures > 10 in 5 Minutes

**Severity:** P2 — Background work failing

**Diagnosis:**
1. Check which queue is failing (crm-sync, test-drive-book, notification, analytics)
2. Check worker logs for error details
3. Verify external service availability (GHL, Google Calendar, SendGrid)

**Resolution:**
- CRM sync failures: Usually transient GHL API issues, jobs auto-retry
- Booking failures: Check Google Calendar credentials
- Notification failures: Check SendGrid/Twilio configuration
- Mass failure: Check Redis connectivity, restart workers

---

## Rollback Procedures

### 1. Application Rollback

**Via Render Dashboard:**
1. Go to Render → Service → Events
2. Click on previous successful deploy
3. Select "Rollback to this deploy"

**Via Git:**
```bash
git revert HEAD
git push origin main
# Render auto-deploys from main
```

### 2. Database Rollback

Migrations are designed to be additive-only (no destructive changes). If a migration needs to be undone:

1. Connect to the database via psql
2. Manually reverse the migration SQL
3. Drop the migration record if tracking

**⚠️ Warning:** Never drop tables in production without a backup.

### 3. Emergency Stop

If the service is causing harm (sending incorrect SMS, etc.):

1. **Render Dashboard → Suspend Service** — Immediately stops the service
2. Investigate the issue
3. Fix, deploy, and resume

---

## Common Operations

### Adding a New Dealership

```bash
curl -X POST https://api.shiftly.ai/api/admin/dealerships \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Motors",
    "phone_number": "+14805559999",
    "sms_provider": "twilio",
    "system_prompt": "You are a helpful AI assistant for Acme Motors..."
  }'
```

### Checking Conversation Status

```bash
curl https://api.shiftly.ai/api/agent/conversation/+14805551234?dealership_id=UUID \
  -H "x-api-key: YOUR_API_KEY"
```

### Viewing Queue Status

Connect to Redis and inspect BullMQ queues:

```bash
# Check pending job count
redis-cli -u $REDIS_URL
> LLEN bull:crm-sync:wait
> LLEN bull:test-drive-book:wait
> LLEN bull:notification:wait
> LLEN bull:analytics:wait
```

### Running Migrations Manually

```bash
# Set DATABASE_URL then:
cd ai-agent-backend && npm run migrate
```

### Rotating API Keys

1. Generate new API key
2. Update `API_SECRET_KEY` in Render env vars
3. Render auto-restarts the service
4. Distribute new key to dealership integrations

---

## Key Metrics to Monitor

| Metric | Healthy Range | Alert Threshold |
|--------|--------------|-----------------|
| Response time (p95) | < 3s | > 5s |
| Anthropic API errors | < 1% | > 5% |
| SMS delivery rate | > 98% | < 90% |
| Escalation rate | < 15% | > 25% |
| Qualification score avg | > 40 | < 30 |
| DB pool utilization | < 60% | > 80% |
| Redis memory | < 50% | > 80% |
| Queue job failures | < 2/hr | > 10/5min |

---

## Contacts

| Role | Contact |
|------|---------|
| DevOps / Infrastructure | (TBD) |
| Backend Lead | (TBD) |
| Anthropic Support | support@anthropic.com |
| Twilio Support | twilio.com/support |
| Render Support | render.com/support |
