import { query } from '../config/database';
import { logger } from '../utils/logger';

export class DealershipService {
  async updateSMSProvider(
    dealershipId: string,
    provider: string,
    credentials: Record<string, string>
  ): Promise<void> {
    await query(
      `UPDATE dealerships
       SET sms_provider = $1, sms_config = $2
       WHERE id = $3`,
      [provider, JSON.stringify(credentials), dealershipId]
    );

    logger.info('Updated SMS provider', { dealershipId, provider });
  }
}
