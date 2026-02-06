import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { query } from '../config/database';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const healthy = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    database: dbHealth,
    redis: redisHealth,
    timestamp: new Date().toISOString(),
  });
});

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const dealershipId = req.query.dealership_id as string;

    if (!dealershipId) {
      return res.status(400).json({ success: false, error: 'dealership_id required' });
    }

    const [conversations, messages, interactions] = await Promise.all([
      query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'active') as active,
           AVG(qualification_score) FILTER (WHERE qualification_score IS NOT NULL) as avg_score
         FROM conversations WHERE dealership_id = $1`,
        [dealershipId]
      ),
      query(
        `SELECT COUNT(*) as total FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.dealership_id = $1`,
        [dealershipId]
      ),
      query(
        `SELECT interaction_type, COUNT(*) as count, COUNT(*) FILTER (WHERE success) as successful
         FROM interactions i
         JOIN conversations c ON i.conversation_id = c.id
         WHERE c.dealership_id = $1
         GROUP BY interaction_type`,
        [dealershipId]
      ),
    ]);

    res.json({
      success: true,
      metrics: {
        total_conversations: parseInt(conversations.rows[0]?.total || '0'),
        active_conversations: parseInt(conversations.rows[0]?.active || '0'),
        avg_qualification_score: parseFloat(conversations.rows[0]?.avg_score || '0'),
        total_messages: parseInt(messages.rows[0]?.total || '0'),
        interactions: interactions.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
