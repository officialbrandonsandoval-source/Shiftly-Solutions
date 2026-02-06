import { DatabaseService } from './database.service';
import { OpenAIService } from './openai.service';
import { TwilioService } from './twilio.service';
import { AgentResponse, IncomingMessage } from '../types/agent';
import { logger } from '../utils/logger';

export class AgentService {
  private db: DatabaseService;
  private openai: OpenAIService;
  private twilio: TwilioService;

  constructor() {
    this.db = new DatabaseService();
    this.openai = new OpenAIService();
    this.twilio = new TwilioService();
  }

  async handleMessage(incoming: IncomingMessage): Promise<AgentResponse> {
    const { customer_phone, dealership_id, message, channel } = incoming;

    try {
      // 1. Find or create conversation
      const conversation = await this.db.findOrCreateConversation(customer_phone, dealership_id);

      // 2. Log incoming message
      await this.db.addMessage(conversation.id, 'customer', message);

      // 3. Get conversation history
      const messages = await this.db.getMessages(conversation.id);

      // 4. Generate response via OpenAI
      const { content: responseText, tokensUsed } = await this.openai.generateResponse(messages);

      // 5. Log agent response
      await this.db.addMessage(conversation.id, 'agent', responseText, {
        tokens_used: tokensUsed,
        model_version: 'gpt-4-turbo-preview',
        channel,
      });

      // 6. Send SMS response (if SMS channel)
      if (channel === 'sms') {
        await this.twilio.sendSMS(customer_phone, responseText);
      }

      // 7. Log interaction
      await this.db.logInteraction(conversation.id, 'message_sent', true, {
        channel,
        tokens: tokensUsed,
      });

      logger.info('Message handled', {
        conversationId: conversation.id,
        channel,
        tokensUsed,
      });

      return {
        success: true,
        conversation_id: conversation.id,
        response: responseText,
        action_taken: 'responded',
        qualification_score: conversation.qualification_score,
      };
    } catch (error: any) {
      logger.error('Failed to handle message', {
        customer_phone,
        dealership_id,
        error: error.message,
      });

      throw error;
    }
  }
}
