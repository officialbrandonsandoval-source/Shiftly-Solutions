import { DatabaseService } from './database.service';
import { logger } from '../utils/logger';

export class RoutingService {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  async assignAgent(dealershipId: string, conversationId: string): Promise<{ userId: string; name: string; email: string } | null> {
    try {
      const users = await this.db.getActiveDealershipUsers(dealershipId);
      if (users.length === 0) {
        logger.warn('No active users for routing', { dealershipId });
        return null;
      }

      // Simple round-robin: pick the first active user
      // In future, consider load balancing, specialties, availability
      const assigned = users[0];

      logger.info('Agent assigned to conversation', {
        conversationId,
        userId: assigned.id,
        name: assigned.name,
      });

      return {
        userId: assigned.id,
        name: assigned.name,
        email: assigned.email,
      };
    } catch (error: any) {
      logger.error('Agent routing failed', { dealershipId, error: error.message });
      return null;
    }
  }
}
