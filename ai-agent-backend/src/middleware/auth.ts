import { Request, Response, NextFunction } from 'express';

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
    return res.status(401).json({ error: 'Missing API key' });
  }

  // For now, simple key validation. Will upgrade to JWT in Phase 3.
  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}
