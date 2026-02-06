import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function validateTwilioWebhook(req: Request, res: Response, next: NextFunction) {
  // Skip validation in development
  if (env.NODE_ENV === 'development') {
    return next();
  }

  const signature = req.headers['x-twilio-signature'] as string;

  if (!signature) {
    logger.warn('Missing Twilio signature');
    return res.status(403).json({ error: 'Missing signature' });
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    logger.warn('Twilio auth token not configured');
    return res.status(503).json({ error: 'Twilio not configured' });
  }

  const url = `${env.WEBHOOK_BASE_URL}${req.originalUrl}`;
  const valid = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, req.body);

  if (!valid) {
    logger.warn('Invalid Twilio signature', { url });
    return res.status(403).json({ error: 'Invalid signature' });
  }

  next();
}
