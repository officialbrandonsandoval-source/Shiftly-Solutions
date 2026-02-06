import { SMSAdapter, SMSConfig } from './sms.adapter';
import { TwilioAdapter } from './twilio.adapter';
import { BandwidthAdapter } from './bandwidth.adapter';

export class SMSFactory {
  static create(provider: string, config: SMSConfig): SMSAdapter {
    switch (provider) {
      case 'twilio':
        return new TwilioAdapter(config);
      case 'bandwidth':
        return new BandwidthAdapter(config);
      case 'att':
      case 'verizon':
        throw new Error(`Provider not implemented: ${provider}`);
      default:
        throw new Error(`Unsupported SMS provider: ${provider}`);
    }
  }
}
