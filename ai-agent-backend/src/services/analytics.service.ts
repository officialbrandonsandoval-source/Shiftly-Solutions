import { DatabaseService } from './database.service';
import { logger } from '../utils/logger';

// Anthropic Claude 3.5 Haiku pricing
const INPUT_COST_PER_MILLION = 0.25;
const OUTPUT_COST_PER_MILLION = 1.25;

export class AnalyticsService {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  async logPromptMetric(params: {
    promptVersion: string;
    variant: string;
    conversationId: string;
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    qualificationDelta?: number;
    escalated?: boolean;
  }): Promise<void> {
    try {
      await this.db.insertPromptMetric(params);
    } catch (error: any) {
      logger.warn('Failed to log prompt metric', { error: error.message });
    }
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;
    return inputCost + outputCost;
  }
}
