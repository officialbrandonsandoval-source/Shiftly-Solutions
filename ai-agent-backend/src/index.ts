import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { env } from './config/env';
import { connectRedis } from './config/redis';
import { analyticsQueue } from './config/queue';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { apiKeyAuth } from './middleware/auth';
import webhookRoutes from './routes/webhook.routes';
import agentRoutes from './routes/agent.routes';
import adminRoutes from './routes/admin.routes';
import chatRoutes from './routes/chat.routes';
import emailRoutes from './routes/email.routes';
import oauthRoutes from './routes/oauth.routes';

// Import workers to start them
import './workers/crm-sync.worker';
import './workers/booking.worker';
import './workers/notification.worker';
import './workers/cleanup.worker';

// Initialize Sentry
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

const app = express();

// Middleware
app.use(helmet());
app.use(cors());

// Webhooks (Twilio form-encoded + Bandwidth JSON)
app.use('/webhook', express.urlencoded({ extended: false }));
app.use('/webhook', express.json());
// API routes use JSON
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Auth (skips webhooks and health)
app.use(apiKeyAuth);

// Routes
app.use('/webhook', webhookRoutes);
app.use('/webhook', emailRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/auth', oauthRoutes);

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
app.use(errorHandler);

// Start
async function start() {
  try {
    await connectRedis();
    logger.info('Redis connected');

    // Schedule daily cleanup at 3 AM
    analyticsQueue.add('daily-cleanup', {}, {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'daily-cleanup',
    }).catch((err) => {
      logger.warn('Failed to schedule cleanup job', { error: err.message });
    });

    app.listen(parseInt(env.PORT), () => {
      logger.info(`Server running on port ${env.PORT}`, { env: env.NODE_ENV });
    });
  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

start();

export default app;
