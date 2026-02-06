import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { Message } from '../types/conversation';
import { ServiceError } from '../utils/errors';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const DEFAULT_SYSTEM_PROMPT = `You are a friendly, professional car dealership assistant named Shiftly. You help customers find the right vehicle and schedule test drives.

RULES:
- Keep responses under 160 characters (SMS length)
- Ask one question at a time
- Be warm and helpful but concise
- Never give exact prices — say "I can get you exact pricing" and offer to connect them
- Never make up vehicle availability or specs
- If the customer is frustrated, offer to connect them with a human
- Extract: vehicle interest, budget range, timeline, trade-in info
- When customer is ready, offer to schedule a test drive

TONE: Friendly, helpful, not pushy. Like a knowledgeable friend at the dealership.`;

const DEFAULT_MODEL = 'claude-3-5-haiku-latest';

export class AnthropicService {
  async generateResponse(
    messages: Message[],
    systemPrompt?: string
  ): Promise<{ content: string; tokensUsed: { prompt: number; completion: number } }> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: DEFAULT_MODEL,
          system: systemPrompt || DEFAULT_SYSTEM_PROMPT,
          messages: messages.slice(-10).map((m) => ({
            role: m.role === 'customer' ? 'user' : 'assistant',
            content: m.content,
          })),
          temperature: 0.7,
          max_tokens: 200,
        });

        const content = response.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('')
          .trim();

        const tokensUsed = {
          prompt: response.usage?.input_tokens || 0,
          completion: response.usage?.output_tokens || 0,
        };

        logger.debug('Anthropic response generated', { tokens: tokensUsed, attempt });
        return { content, tokensUsed };
      } catch (error: any) {
        lastError = error;

        if (error?.status === 429) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn('Anthropic rate limited, backing off', { attempt, delay });
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (error?.status === 400 || error?.status === 401) {
          throw new ServiceError('Anthropic', 'generateResponse', error, false);
        }

        logger.error('Anthropic error', { attempt, error: error.message });
      }
    }

    logger.error('Anthropic failed after retries, using fallback', { error: lastError?.message });
    return {
      content: this.generateFallbackResponse(messages),
      tokensUsed: { prompt: 0, completion: 0 },
    };
  }

  private generateFallbackResponse(messages: Message[]): string {
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';

    if (lastMessage.includes('price') || lastMessage.includes('cost')) {
      return "I'd love to help with pricing! What vehicle are you interested in? I can get you exact numbers.";
    }

    if (lastMessage.includes('test drive') || lastMessage.includes('appointment')) {
      return 'I can help schedule a test drive! What day works best for you this week?';
    }

    if (lastMessage.includes('trade') || lastMessage.includes('trade-in')) {
      return "We'd be happy to look at your trade-in! What are you currently driving?";
    }

    return "Thanks for reaching out! I'm here to help you find the perfect vehicle. What are you looking for?";
  }
}
