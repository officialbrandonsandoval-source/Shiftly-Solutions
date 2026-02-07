import { DatabaseService } from './database.service';
import { AnthropicService } from './anthropic.service';
import { TwilioService } from './twilio.service';
import { QualificationService } from './qualification.service';
import { ContextExtractionService, ExtractedContext } from './context.service';
import { EscalationService } from './escalation.service';
import { AgentResponse, IncomingMessage } from '../types/agent';
import { crmSyncQueue } from '../config/queue';
import { logger } from '../utils/logger';

export class AgentService {
  private db: DatabaseService;
  private openai: AnthropicService;
  private twilio: TwilioService;
  private qualification: QualificationService;
  private contextExtraction: ContextExtractionService;
  private escalation: EscalationService;

  constructor() {
    this.db = new DatabaseService();
    this.openai = new AnthropicService();
    this.twilio = new TwilioService();
    this.qualification = new QualificationService();
    this.contextExtraction = new ContextExtractionService();
    this.escalation = new EscalationService();
  }

  async handleMessage(incoming: IncomingMessage): Promise<AgentResponse> {
    const { customer_phone, dealership_id, message, channel } = incoming;

    try {
      // 1. Find or create conversation
      const conversation = await this.db.findOrCreateConversation(customer_phone, dealership_id);

      // 1b. Enqueue CRM sync (async, non-blocking)
      crmSyncQueue.add(
        'sync-contact',
        {
          conversation_id: conversation.id,
          customer_phone,
          dealership_id,
        },
        { jobId: `crm-sync-${conversation.id}` }
      ).catch((err) => {
        logger.warn('Failed to enqueue CRM sync', {
          error: err.message,
          conversation_id: conversation.id,
        });
      });

      // 2. Log incoming message
      await this.db.addMessage(conversation.id, 'customer', message);

      // 3. Get conversation history
      const messages = await this.db.getMessages(conversation.id);

      // 4. Check for escalation
      const escalationResult = this.escalation.evaluate(messages);
      if (escalationResult.shouldEscalate) {
        await this.db.updateConversationStatus(conversation.id, 'escalated');
        await this.db.logInteraction(conversation.id, 'escalation', true, {
          reason: escalationResult.reason,
          confidence: escalationResult.confidence,
        });

        const escalationResponse = "I understand your concern. Let me connect you with one of our team members who can help you directly. Someone will reach out to you shortly!";

        await this.db.addMessage(conversation.id, 'agent', escalationResponse, {
          escalated: true,
          escalation_reason: escalationResult.reason,
          channel,
        });

        if (channel === 'sms') {
          await this.twilio.sendSMS(customer_phone, escalationResponse);
        }

        logger.info('Conversation escalated', {
          conversationId: conversation.id,
          reason: escalationResult.reason,
          confidence: escalationResult.confidence,
        });

        return {
          success: true,
          conversation_id: conversation.id,
          response: escalationResponse,
          action_taken: 'escalated',
          qualification_score: conversation.qualification_score,
        };
      }

      // 5. Extract context from messages
      const extractedContext = this.contextExtraction.extractFromMessages(messages);
      await this.persistContext(conversation.id, extractedContext);

      // 6. Generate response via Anthropic
      const { content: responseText, tokensUsed } = await this.openai.generateResponse(messages);

      // 7. Log agent response
      await this.db.addMessage(conversation.id, 'agent', responseText, {
        tokens_used: tokensUsed,
        model_version: 'claude-3-5-haiku-latest',
        channel,
      });

      // 8. Send SMS response (if SMS channel)
      if (channel === 'sms') {
        await this.twilio.sendSMS(customer_phone, responseText);
      }

      // 9. Score the conversation for lead qualification
      const qualificationScore = await this.qualification.scoreConversation(conversation.id, messages);
      await this.db.updateQualificationScore(conversation.id, qualificationScore);

      // 10. Log interaction
      await this.db.logInteraction(conversation.id, 'message_sent', true, {
        channel,
        tokens: tokensUsed,
        qualification_score: qualificationScore,
      });

      logger.info('Message handled', {
        conversationId: conversation.id,
        channel,
        tokensUsed,
        qualificationScore,
      });

      return {
        success: true,
        conversation_id: conversation.id,
        response: responseText,
        action_taken: 'responded',
        qualification_score: qualificationScore,
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

  private async persistContext(conversationId: string, context: ExtractedContext): Promise<void> {
    const contextTypes = ['vehicle_interest', 'budget', 'timeline', 'trade_in'] as const;

    for (const type of contextTypes) {
      const value = context[type];
      if (value && Object.keys(value).length > 0) {
        const confidence = this.estimateConfidence(value);
        await this.db.upsertCustomerContext(conversationId, type, value, confidence);
      }
    }
  }

  private estimateConfidence(context: Record<string, unknown>): number {
    const fieldCount = Object.keys(context).length;
    if (fieldCount >= 3) return 0.9;
    if (fieldCount >= 2) return 0.7;
    return 0.5;
  }
}
