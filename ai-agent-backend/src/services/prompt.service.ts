import { DatabaseService } from './database.service';
import { ExperimentService } from './experiment.service';
import { logger } from '../utils/logger';

interface PromptConfig {
  systemPrompt: string;
  version: string;
  variant: string;
}

export class PromptService {
  private db: DatabaseService;
  private experiment: ExperimentService;

  constructor() {
    this.db = new DatabaseService();
    this.experiment = new ExperimentService();
  }

  async getPromptForConversation(conversationId: string): Promise<PromptConfig | null> {
    try {
      const activePrompt = await this.db.getActivePrompt();
      if (!activePrompt) return null;

      // If A/B testing is configured (ratio < 1.0), assign variant
      if (activePrompt.ab_ratio < 1.0) {
        const variant = this.experiment.getVariant(conversationId, activePrompt.ab_ratio);
        if (variant === 'B') {
          const variantB = await this.db.getPromptByVariant(activePrompt.version, 'B');
          if (variantB) {
            return {
              systemPrompt: variantB.system_prompt,
              version: variantB.version,
              variant: 'B',
            };
          }
        }
      }

      return {
        systemPrompt: activePrompt.system_prompt,
        version: activePrompt.version,
        variant: 'A',
      };
    } catch (error: any) {
      logger.warn('Failed to get prompt config, using default', { error: error.message });
      return null;
    }
  }
}
