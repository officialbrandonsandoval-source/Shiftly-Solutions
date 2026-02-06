import { Request } from 'express';
import crypto from 'crypto';
import { Client, ApiController } from '@bandwidth/messaging';
import { SMSAdapter, InboundMessage, SMSConfig } from './sms.adapter';
import { logger } from '../../utils/logger';
import { SMSError } from '../../utils/errors';
import { DatabaseService } from '../database.service';

export class BandwidthAdapter implements SMSAdapter {
  private controller: ApiController;
  private db = new DatabaseService();
  private accountId: string;
  private applicationId: string;
  private apiSecret: string;

  constructor(private config: SMSConfig) {
    const accountId = config.credentials.BANDWIDTH_ACCOUNT_ID;
    const apiToken = config.credentials.BANDWIDTH_API_TOKEN;
    const apiSecret = config.credentials.BANDWIDTH_API_SECRET;
    const applicationId = config.credentials.BANDWIDTH_APPLICATION_ID;

    if (!accountId || !apiToken || !apiSecret || !applicationId) {
      throw new SMSError('bandwidth', 'init', new Error('Missing Bandwidth credentials'), false);
    }

    this.accountId = accountId;
    this.applicationId = applicationId;
    this.apiSecret = apiSecret;

    const client = new Client({
      basicAuthUserName: apiToken,
      basicAuthPassword: apiSecret,
    });

    this.controller = new ApiController(client);
  }

  async sendSMS(to: string, from: string, message: string): Promise<void> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.controller.createMessage(this.accountId, {
          applicationId: this.applicationId,
          to: [to],
          from,
          text: message,
        });

        logger.info('SMS sent', { provider: 'bandwidth', to, from, attempt });
        await this.logInteractionByPhones(from, to, true);
        return;
      } catch (error: any) {
        logger.warn('Bandwidth send failed', { to, from, attempt, error: error.message });

        if (attempt === maxRetries) {
          await this.logInteractionByPhones(from, to, false, error.message);
          throw new SMSError('bandwidth', 'sendSMS', error, false);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  async handleInbound(payload: any): Promise<InboundMessage> {
    const event = Array.isArray(payload) ? payload[0] : payload;
    const message = event?.message || event;

    return {
      from: message?.from || event?.from || '',
      to: message?.to || event?.to || '',
      body: message?.text || event?.text || '',
      timestamp: message?.time ? new Date(message.time) : new Date(),
      provider: 'bandwidth',
    };
  }

  validateWebhook(req: Request): boolean {
    const signature = req.headers['x-bandwidth-signature'] as string;
    const timestamp = req.headers['x-bandwidth-timestamp'] as string;

    if (!signature || !timestamp || !this.apiSecret) {
      return false;
    }

    const payload = JSON.stringify(req.body || {});
    const data = `${timestamp}.${payload}`;
    const digest = crypto.createHmac('sha256', this.apiSecret).update(data).digest('base64');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
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
        provider: 'bandwidth',
        dealership_id: dealership.id,
        customer_phone: to,
        from,
      }, errorMessage);
    } catch (error: any) {
      logger.warn('Failed to log SMS interaction', { provider: 'bandwidth', error: error.message });
    }
  }
}
