import { Request } from 'express';
import twilio from 'twilio';
import { SMSAdapter, InboundMessage, SMSConfig } from './sms.adapter';
import { logger } from '../../utils/logger';
import { SMSError } from '../../utils/errors';
import { DatabaseService } from '../database.service';

export class TwilioAdapter implements SMSAdapter {
  private client: ReturnType<typeof twilio>;
  private db = new DatabaseService();

  constructor(private config: SMSConfig) {
    const accountSid = config.credentials.TWILIO_ACCOUNT_SID;
    const authToken = config.credentials.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new SMSError('twilio', 'init', new Error('Missing Twilio credentials'), false);
    }

    this.client = twilio(accountSid, authToken);
  }

  async sendSMS(to: string, from: string, message: string): Promise<void> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.messages.create({ to, from, body: message });
        logger.info('SMS sent', { provider: 'twilio', to, from, attempt });
        await this.logInteractionByPhones(from, to, true);
        return;
      } catch (error: any) {
        logger.warn('Twilio send failed', { to, from, attempt, error: error.message });

        if (attempt === maxRetries) {
          await this.logInteractionByPhones(from, to, false, error.message);
          throw new SMSError('twilio', 'sendSMS', error, false);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  async handleInbound(payload: any): Promise<InboundMessage> {
    return {
      from: payload.From,
      to: payload.To,
      body: payload.Body,
      timestamp: new Date(),
      provider: 'twilio',
    };
  }

  validateWebhook(req: Request): boolean {
    const signature = req.headers['x-twilio-signature'] as string;
    const authToken = this.config.credentials.TWILIO_AUTH_TOKEN;
    const baseUrl = this.config.credentials.WEBHOOK_BASE_URL || '';

    if (!signature || !authToken || !baseUrl) {
      return false;
    }

    const url = `${baseUrl}${req.originalUrl}`;
    return twilio.validateRequest(authToken, signature, url, req.body);
  }

  private async logInteractionByPhones(from: string, to: string, success: boolean, errorMessage?: string) {
    try {
      const dealership = await this.db.getDealershipByPhone(from);
      if (!dealership) {
        return;
      }

      const conversation = await this.db.getConversationByPhone(to, dealership.id);
      if (!conversation) {
        return;
      }

      await this.db.logInteraction(conversation.id, 'sms_send', success, {
        provider: 'twilio',
        dealership_id: dealership.id,
        customer_phone: to,
        from,
      }, errorMessage);
    } catch (error: any) {
      logger.warn('Failed to log SMS interaction', { provider: 'twilio', error: error.message });
    }
  }
}
