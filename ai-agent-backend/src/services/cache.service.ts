import { redis } from '../config/redis';
import { ConversationState } from '../types/conversation';
import { logger } from '../utils/logger';

const CACHE_TTL = 86400; // 24 hours
const KEY_PREFIX = 'conv:';

export class CacheService {
  async getConversationState(conversationId: string): Promise<ConversationState | null> {
    try {
      const data = await redis.get(`${KEY_PREFIX}${conversationId}`);
      if (!data) return null;
      return JSON.parse(data) as ConversationState;
    } catch (error: any) {
      logger.warn('Cache get failed', { conversationId, error: error.message });
      return null;
    }
  }

  async setConversationState(conversationId: string, state: ConversationState): Promise<void> {
    try {
      await redis.set(`${KEY_PREFIX}${conversationId}`, JSON.stringify(state), { EX: CACHE_TTL });
    } catch (error: any) {
      logger.warn('Cache set failed', { conversationId, error: error.message });
    }
  }

  async invalidate(conversationId: string): Promise<void> {
    try {
      await redis.del(`${KEY_PREFIX}${conversationId}`);
    } catch (error: any) {
      logger.warn('Cache invalidate failed', { conversationId, error: error.message });
    }
  }
}
