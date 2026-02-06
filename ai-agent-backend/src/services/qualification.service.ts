import { logger } from '../utils/logger';

export class QualificationService {
  async scoreConversation(conversationId: string): Promise<number> {
    // Stub: returns 0 until Week 2 implementation
    logger.debug('Qualification scoring stub called', { conversationId });
    return 0;
  }
}
