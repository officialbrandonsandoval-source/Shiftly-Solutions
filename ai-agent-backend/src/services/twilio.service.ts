import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ServiceError } from '../utils/errors';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export class TwilioService {
  async sendSMS(to: string, message: string): Promise<string> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await client.messages.create({
          to,
          from: env.TWILIO_PHONE_NUMBER,
          body: message,
        });

        logger.info('SMS sent', { to, messageSid: result.sid });
        return result.sid;
      } catch (error: any) {
        if (attempt === maxRetries) {
          throw new ServiceError('Twilio', 'sendSMS', error, false);
        }

        // Don't retry on invalid number
        if (error?.code === 21211 || error?.code === 21614) {
          throw new ServiceError('Twilio', 'sendSMS', error, false);
        }

        logger.warn('Twilio send failed, retrying', { attempt, error: error.message });
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error('Unreachable');
  }

  validateWebhookSignature(signature: string, url: string, params: Record<string, string>): boolean {
    return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
  }
}
