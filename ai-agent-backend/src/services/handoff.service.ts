import { DatabaseService } from './database.service';
import { logger } from '../utils/logger';

export class HandoffService {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  async startHandoff(conversationId: string, agentUserId: string): Promise<void> {
    await this.db.updateConversationStatus(conversationId, 'human_active');
    await this.db.logInteraction(conversationId, 'human_handoff_start', true, {
      agent_user_id: agentUserId,
    });

    logger.info('Human handoff started', { conversationId, agentUserId });
  }

  async endHandoff(conversationId: string): Promise<void> {
    await this.db.updateConversationStatus(conversationId, 'active');
    await this.db.logInteraction(conversationId, 'human_handoff_end', true);

    logger.info('Human handoff ended, returning to AI', { conversationId });
  }
}
