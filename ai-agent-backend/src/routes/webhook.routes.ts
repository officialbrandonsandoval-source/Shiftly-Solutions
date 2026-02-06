import { Router, Request, Response } from 'express';
import { validateTwilioWebhook } from '../middleware/twilio.validator';
import { AgentService } from '../services/agent.service';
import { logger } from '../utils/logger';

const router = Router();
const agentService = new AgentService();

// Twilio sends form-encoded POST
router.post('/sms', validateTwilioWebhook, async (req: Request, res: Response) => {
  try {
    const { From: from, Body: body, To: to } = req.body;

    logger.info('SMS received', { from, to, bodyLength: body?.length });

    if (!from || !body) {
      return res.status(400).json({ error: 'Missing From or Body' });
    }

    // Look up dealership by Twilio number (for now, use default)
    // TODO: Map Twilio numbers to dealerships in Phase 2
    const dealershipId = req.body.dealership_id || '00000000-0000-0000-0000-000000000001';

    await agentService.handleMessage({
      customer_phone: from,
      dealership_id: dealershipId,
      message: body,
      channel: 'sms',
    });

    // Return TwiML (empty — we send the response via API, not TwiML)
    res.type('text/xml').send('<Response></Response>');
  } catch (error: any) {
    logger.error('Webhook error', { error: error.message });
    // Always return 200 to Twilio to prevent retries
    res.type('text/xml').send('<Response></Response>');
  }
});

export default router;
