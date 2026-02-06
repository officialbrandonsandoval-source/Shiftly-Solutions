import { Router, Request, Response } from 'express';
import { AgentService } from '../services/agent.service';
import { DatabaseService } from '../services/database.service';
import { SMSFactory } from '../services/sms/sms.factory';
import { SMSAdapter } from '../services/sms/sms.adapter';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const router = Router();
const agentService = new AgentService();
const dbService = new DatabaseService();

function buildAdapter(provider: 'twilio' | 'bandwidth', dealership: any): SMSAdapter {
  const smsConfig = dealership?.sms_config || {};

  if (provider === 'twilio') {
    return SMSFactory.create('twilio', {
      provider: 'twilio',
      credentials: {
        TWILIO_ACCOUNT_SID: smsConfig.TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID || '',
        TWILIO_AUTH_TOKEN: smsConfig.TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN || '',
        TWILIO_PHONE_NUMBER: smsConfig.TWILIO_PHONE_NUMBER || env.TWILIO_PHONE_NUMBER || '',
        WEBHOOK_BASE_URL: env.WEBHOOK_BASE_URL,
      },
    });
  }

  return SMSFactory.create('bandwidth', {
    provider: 'bandwidth',
    credentials: {
      BANDWIDTH_ACCOUNT_ID: smsConfig.BANDWIDTH_ACCOUNT_ID || env.BANDWIDTH_ACCOUNT_ID || '',
      BANDWIDTH_API_TOKEN: smsConfig.BANDWIDTH_API_TOKEN || env.BANDWIDTH_API_TOKEN || '',
      BANDWIDTH_API_SECRET: smsConfig.BANDWIDTH_API_SECRET || env.BANDWIDTH_API_SECRET || '',
      BANDWIDTH_APPLICATION_ID: smsConfig.BANDWIDTH_APPLICATION_ID || env.BANDWIDTH_APPLICATION_ID || '',
      WEBHOOK_BASE_URL: env.WEBHOOK_BASE_URL,
    },
  });
}

async function resolveDealershipByPhone(to: string) {
  const dealership = await dbService.getDealershipByPhone(to);
  if (dealership) {
    return dealership;
  }

  return dbService.getDefaultDealership();
}

// Twilio sends form-encoded POST (backward compatible)
router.post('/sms', async (req: Request, res: Response) => {
  try {
    const { From: from, Body: body, To: to } = req.body;

    if (!from || !body || !to) {
      return res.status(400).json({ error: 'Missing From, To, or Body' });
    }

    const dealership = await resolveDealershipByPhone(to);
    if (!dealership) {
      return res.status(404).json({ error: 'Dealership not found' });
    }

    const adapter = buildAdapter('twilio', dealership);
    if (!adapter.validateWebhook(req)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const inbound = await adapter.handleInbound(req.body);
    logger.info('SMS received', { from: inbound.from, to: inbound.to, provider: inbound.provider });

    const result = await agentService.handleMessage({
      customer_phone: inbound.from,
      dealership_id: dealership.id,
      message: inbound.body,
      channel: 'sms',
    });

    await dbService.logInteraction(result.conversation_id, 'sms_received', true, {
      provider: inbound.provider,
      dealership_id: dealership.id,
      customer_phone: inbound.from,
    });

    // Return TwiML (empty — we send the response via API, not TwiML)
    res.type('text/xml').send('<Response></Response>');
  } catch (error: any) {
    logger.error('Webhook error', { error: error.message });
    // Always return 200 to Twilio to prevent retries
    res.type('text/xml').send('<Response></Response>');
  }
});

router.post('/sms/twilio', async (req: Request, res: Response) => {
  try {
    const { From: from, Body: body, To: to } = req.body;

    if (!from || !body || !to) {
      return res.status(400).json({ error: 'Missing From, To, or Body' });
    }

    const dealership = await resolveDealershipByPhone(to);
    if (!dealership) {
      return res.status(404).json({ error: 'Dealership not found' });
    }

    const adapter = buildAdapter('twilio', dealership);
    if (!adapter.validateWebhook(req)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const inbound = await adapter.handleInbound(req.body);
    logger.info('SMS received', { from: inbound.from, to: inbound.to, provider: inbound.provider });

    const result = await agentService.handleMessage({
      customer_phone: inbound.from,
      dealership_id: dealership.id,
      message: inbound.body,
      channel: 'sms',
    });

    await dbService.logInteraction(result.conversation_id, 'sms_received', true, {
      provider: inbound.provider,
      dealership_id: dealership.id,
      customer_phone: inbound.from,
    });

    res.type('text/xml').send('<Response></Response>');
  } catch (error: any) {
    logger.error('Twilio webhook error', { error: error.message });
    res.type('text/xml').send('<Response></Response>');
  }
});

router.post('/sms/bandwidth', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const event = Array.isArray(payload) ? payload[0] : payload;
    const to = event?.message?.to || event?.to;

    if (!to) {
      return res.status(400).json({ error: 'Missing to' });
    }

    const dealership = await resolveDealershipByPhone(to);
    if (!dealership) {
      return res.status(404).json({ error: 'Dealership not found' });
    }

    const adapter = buildAdapter('bandwidth', dealership);
    if (!adapter.validateWebhook(req)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const inbound = await adapter.handleInbound(payload);
    logger.info('SMS received', { from: inbound.from, to: inbound.to, provider: inbound.provider });

    const result = await agentService.handleMessage({
      customer_phone: inbound.from,
      dealership_id: dealership.id,
      message: inbound.body,
      channel: 'sms',
    });

    await dbService.logInteraction(result.conversation_id, 'sms_received', true, {
      provider: inbound.provider,
      dealership_id: dealership.id,
      customer_phone: inbound.from,
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Bandwidth webhook error', { error: error.message });
    res.status(200).json({ success: true });
  }
});

export default router;
