# Shiftly AI Agent — Deployment Guide

## Architecture Overview

```
┌──────────────┐      ┌──────────────┐
│  Twilio SMS  │─────▶│              │
├──────────────┤      │   Express    │      ┌──────────┐
│  Bandwidth   │─────▶│   API        │─────▶│ Anthropic│
├──────────────┤      │   Server     │      │ Claude   │
│  SendGrid    │─────▶│  (Render)    │      └──────────┘
├──────────────┤      │              │
│  Web Chat    │─────▶│              │
└──────────────┘      └──────┬───────┘
                             │
                    ┌────────┼────────┐
                    │        │        │
               ┌────▼──┐ ┌──▼───┐ ┌──▼──────┐
               │Postgres│ │Redis │ │BullMQ   │
               │  (DB)  │ │Cache │ │Workers  │
               └────────┘ └──────┘ └─────────┘
```

## Render Setup

### Prerequisites

1. GitHub repository with the codebase
2. Render account at [render.com](https://render.com)
3. API keys for: Anthropic, Twilio/Bandwidth, GHL (optional), Google Calendar (optional), SendGrid (optional)

### Infrastructure (via render.yaml)

The `render.yaml` in the repo root defines all services:

| Service | Type | Plan |
|---------|------|------|
| `ai-agent-backend` | Web Service | Starter |
| PostgreSQL 15 | Managed Database | Basic 256MB |
| Redis 7 | Key-Value Store | Starter |

### Deploy Steps

1. **Connect GitHub:** Link your GitHub repo to Render
2. **Blueprint Deploy:** Render auto-detects `render.yaml` and creates all services
3. **Set Environment Variables:** Add all required env vars in the Render dashboard

### Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Auto-set by Render |
| `REDIS_URL` | Redis connection string | Auto-set by Render |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | `AC...` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `...` |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | `+15551234567` |
| `API_SECRET_KEY` | API key for authenticated routes | Any strong random string |
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `10000` (Render default) |

#### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry error tracking DSN | — |
| `GHL_CLIENT_ID` | GoHighLevel OAuth client ID | — |
| `GHL_CLIENT_SECRET` | GoHighLevel OAuth client secret | — |
| `GHL_REDIRECT_URI` | GHL OAuth redirect URI | — |
| `GOOGLE_CALENDAR_CREDENTIALS` | Google service account JSON (base64) | — |
| `GOOGLE_CALENDAR_ID` | Google Calendar ID | — |
| `SENDGRID_API_KEY` | SendGrid API key | — |
| `SENDGRID_FROM_EMAIL` | SendGrid sender email | — |
| `BANDWIDTH_ACCOUNT_ID` | Bandwidth account ID | — |
| `BANDWIDTH_API_TOKEN` | Bandwidth API token | — |
| `BANDWIDTH_API_SECRET` | Bandwidth API secret | — |
| `BANDWIDTH_APPLICATION_ID` | Bandwidth app ID | — |
| `BANDWIDTH_PHONE_NUMBER` | Bandwidth phone number | — |
| `LOG_LEVEL` | Winston log level | `info` |

### Build & Start

- **Build command:** `cd ai-agent-backend && npm ci --include=dev && npm run build`
- **Start command:** `cd ai-agent-backend && npm run start`

### Database Migrations

Migrations must be run manually after first deploy:

```bash
# Connect to your Render database (use psql or pgAdmin)
# Run each migration file in order:
# migrations/001_create_dealerships.sql
# migrations/002_create_conversations.sql
# ...through...
# migrations/011_create_prompt_metrics.sql
```

Or use the migrate script if `DATABASE_URL` is set:

```bash
cd ai-agent-backend && npm run migrate
```

---

## CI/CD Pipeline

### GitHub Actions

The repo includes `.github/workflows/ci.yml` which runs on every PR and push to `main`:

1. **Lint:** TypeScript type checking (`tsc --noEmit`)
2. **Test:** Jest test suite with PostgreSQL + Redis services
3. **Build:** TypeScript compilation
4. **Deploy:** Triggers Render deploy hook on `main` branch pushes

### Setup

1. Go to GitHub repo → Settings → Secrets and Variables → Actions
2. Add secret: `RENDER_DEPLOY_HOOK` — the deploy hook URL from Render dashboard

### Flow

```
PR Created → CI runs (lint + test + build)
                ↓ (pass)
Merge to main → CI runs → Deploy job triggers Render
                                    ↓
                           Render pulls latest code
                           Runs build command
                           Restarts service
```

---

## Scaling Considerations

### Current Limits (Starter Plan)

- **Web Service:** 512MB RAM, shared CPU
- **PostgreSQL:** 256MB storage
- **Redis:** 25MB storage

### When to Scale

| Signal | Action |
|--------|--------|
| Response times > 3s consistently | Upgrade to Standard plan |
| DB approaching storage limit | Upgrade PostgreSQL plan |
| Redis memory > 80% | Upgrade Redis or add eviction policy |
| Queue job backlog growing | Add dedicated worker service |
| 50+ concurrent dealerships | Add horizontal scaling |

### Horizontal Scaling

1. **Separate worker process:** Create a second Render service running only BullMQ workers
2. **Read replicas:** Add PostgreSQL read replica for read-heavy queries
3. **CDN:** Add Cloudflare in front for static assets and DDoS protection

---

## Monitoring

### Sentry

Set `SENTRY_DSN` environment variable to enable:
- Error tracking with stack traces
- Performance monitoring (10% sample rate in production)
- Express error handler integration

### Health Checks

- `GET /health` — Basic health (always available)
- `GET /api/admin/health` — Deep health check (DB, Redis, external services)

Render automatically pings the health endpoint for zero-downtime deploys.

### Logs

Render provides log streaming in the dashboard. Logs are structured JSON in production:

```json
{
  "level": "info",
  "message": "Message processed",
  "timestamp": "2026-02-06T10:00:00.000Z",
  "conversationId": "...",
  "responseTime": 1234
}
```
