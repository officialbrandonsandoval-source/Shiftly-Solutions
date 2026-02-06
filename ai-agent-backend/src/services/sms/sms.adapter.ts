import { Request } from 'express';

export interface SMSAdapter {
  sendSMS(to: string, from: string, message: string): Promise<void>;
  handleInbound(payload: any): Promise<InboundMessage>;
  validateWebhook(req: Request): boolean;
}

export interface InboundMessage {
  from: string;
  to: string;
  body: string;
  timestamp: Date;
  provider: string;
}

export interface SMSConfig {
  provider: 'twilio' | 'bandwidth' | 'att' | 'verizon';
  credentials: Record<string, string>;
}
