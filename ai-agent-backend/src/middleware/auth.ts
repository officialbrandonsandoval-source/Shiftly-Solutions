import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

let validKeys: Set<string> | null = null;

function getValidKeys(): Set<string> {
  if (!validKeys) {
    const raw = env.API_KEYS || '';
    validKeys = new Set(
      raw
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    );
  }
  return validKeys;
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  // Skip auth for webhooks (Twilio validates its own signature)
  if (req.path.startsWith('/webhook')) {
    return next();
  }

  // Skip auth for health check
  if (req.path === '/health' || req.path === '/api/admin/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'Missing API key' });
  }

  const keys = getValidKeys();
  if (keys.size === 0 || !keys.has(apiKey)) {
    return res.status(403).json({ success: false, error: 'Invalid API key' });
  }

  next();
}
