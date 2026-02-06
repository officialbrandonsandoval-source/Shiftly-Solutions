import { env } from '../config/env';
import { SMSFactory } from './sms/sms.factory';
import { SMSAdapter } from './sms/sms.adapter';
import { SMSError } from '../utils/errors';

export class TwilioService {
  private adapter: SMSAdapter | null = null;

  async sendSMS(to: string, message: string): Promise<string> {
    if (!env.TWILIO_PHONE_NUMBER) {
      throw new SMSError('twilio', 'sendSMS', new Error('Missing Twilio phone number'), false);
    }

    if (!this.adapter) {
      this.adapter = SMSFactory.create('twilio', {
        provider: 'twilio',
        credentials: {
          TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID || '',
          TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN || '',
          TWILIO_PHONE_NUMBER: env.TWILIO_PHONE_NUMBER || '',
          WEBHOOK_BASE_URL: env.WEBHOOK_BASE_URL,
        },
      });
    }

    await this.adapter.sendSMS(to, env.TWILIO_PHONE_NUMBER, message);
    return 'sent';
  }
}
