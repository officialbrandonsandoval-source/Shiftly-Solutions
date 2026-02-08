import { Router, Request, Response } from 'express';
import { AgentService } from '../services/agent.service';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

const router = Router();
const agentService = new AgentService();
const db = new DatabaseService();

/**
 * Inbound email webhook (from SendGrid Inbound Parse or similar).
 * Expects JSON with from, to, subject, text fields.
 */
router.post('/email', async (req: Request, res: Response) => {
  try {
    const { from, to, subject, text } = req.body;

    if (!from || !text) {
      return res.status(400).json({ error: 'Missing from or text' });
    }

    // Extract email address from "Name <email>" format
    const emailMatch = from.match(/<(.+?)>/) || [null, from];
    const senderEmail = emailMatch[1] || from;

    // Use the email as the "phone" identifier for email channels
    const dealership = await db.getDefaultDealership();
    if (!dealership) {
      return res.status(404).json({ error: 'No dealership configured' });
    }

    const result = await agentService.handleMessage({
      customer_phone: senderEmail,
      dealership_id: dealership.id,
      message: text.substring(0, 5000),
      channel: 'email',
    });

    logger.info('Inbound email processed', { from: senderEmail, subject });
    res.json({ success: true, conversation_id: result.conversation_id });
  } catch (error: any) {
    logger.error('Email webhook error', { error: error.message });
    res.status(200).json({ success: true }); // Always 200 to prevent retries
  }
});

export default router;
