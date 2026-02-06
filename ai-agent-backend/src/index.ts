import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { apiKeyAuth } from './middleware/auth';
import webhookRoutes from './routes/webhook.routes';
import agentRoutes from './routes/agent.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());

// Twilio sends form-encoded data
app.use('/webhook', express.urlencoded({ extended: false }));
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
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Start
async function start() {
  try {
    await connectRedis();
    logger.info('Redis connected');

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
