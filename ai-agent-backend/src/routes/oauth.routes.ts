import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const router = Router();
const db = new DatabaseService();

/**
 * GoHighLevel OAuth callback.
 * Exchanges authorization code for access/refresh tokens.
 */
router.get('/ghl/callback', async (req: Request, res: Response) => {
  try {
    const { code, dealership_id } = req.query;

    if (!code || !dealership_id) {
      return res.status(400).json({ error: 'Missing code or dealership_id' });
    }

    if (!env.GHL_CLIENT_ID || !env.GHL_CLIENT_SECRET || !env.GHL_REDIRECT_URI) {
      return res.status(503).json({ error: 'GHL OAuth not configured' });
    }

    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GHL_CLIENT_ID,
        client_secret: env.GHL_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: env.GHL_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`GHL token exchange failed: ${errorText}`);
    }

    const tokens = await tokenResponse.json() as any;

    // Store tokens in dealership config
    await db.updateDealershipCrmConfig(dealership_id as string, 'gohighlevel', {
      apiKey: tokens.access_token,
      refreshToken: tokens.refresh_token,
      locationId: tokens.locationId || env.GHL_LOCATION_ID || '',
      calendarId: env.GHL_CALENDAR_ID || '',
    });

    logger.info('GHL OAuth completed', { dealershipId: dealership_id });
    res.json({ success: true, message: 'GoHighLevel connected successfully' });
  } catch (error: any) {
    logger.error('GHL OAuth error', { error: error.message });
    res.status(500).json({ success: false, error: 'OAuth flow failed' });
  }
});

export default router;
