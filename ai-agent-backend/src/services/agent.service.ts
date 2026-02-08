import { DatabaseService } from './database.service';
import { AnthropicService } from './anthropic.service';
import { TwilioService } from './twilio.service';
import { QualificationService } from './qualification.service';
import { ContextExtractionService, ExtractedContext } from './context.service';
import { EscalationService } from './escalation.service';
import { BookingService } from './booking.service';
import { PromptService } from './prompt.service';
import { AnalyticsService } from './analytics.service';
import { RoutingService } from './routing.service';
import { SendGridAdapter } from './email/sendgrid.adapter';
import { AgentResponse, IncomingMessage } from '../types/agent';
import { crmSyncQueue, testDriveBookQueue, notificationQueue } from '../config/queue';
import { logger } from '../utils/logger';

export class AgentService {
  private db: DatabaseService;
  private openai: AnthropicService;
  private twilio: TwilioService;
  private qualification: QualificationService;
  private contextExtraction: ContextExtractionService;
  private escalation: EscalationService;
  private booking: BookingService;
  private promptService: PromptService;
  private analytics: AnalyticsService;
  private routing: RoutingService;
  private email: SendGridAdapter;

  constructor() {
    this.db = new DatabaseService();
    this.openai = new AnthropicService();
    this.twilio = new TwilioService();
    this.qualification = new QualificationService();
    this.contextExtraction = new ContextExtractionService();
    this.escalation = new EscalationService();
    this.booking = new BookingService();
    this.promptService = new PromptService();
    this.analytics = new AnalyticsService();
    this.routing = new RoutingService();
    this.email = new SendGridAdapter();
  }

  async handleMessage(incoming: IncomingMessage): Promise<AgentResponse> {
    const { customer_phone, dealership_id, message, channel } = incoming;

    try {
      // 1. Find or create conversation (with isNew flag for CRM sync)
      const { conversation, isNew } = await this.db.findOrCreateConversationWithFlag(customer_phone, dealership_id);

      // 1b. If new conversation, enqueue CRM sync
      if (isNew) {
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
      }

      // 1c. Guard: if human agent is active, don't respond with AI
      if (conversation.status === 'human_active') {
        await this.db.addMessage(conversation.id, 'customer', message);
        return {
          success: true,
          conversation_id: conversation.id,
          response: '',
          action_taken: 'human_active',
          qualification_score: conversation.qualification_score,
        };
      }

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

        // Route to human agent
        const agent = await this.routing.assignAgent(dealership_id, conversation.id);
        if (agent) {
          notificationQueue.add('escalation-notify', {
            type: 'email',
            to: agent.email,
            subject: `Escalation: Conversation ${conversation.id}`,
            message: `Customer ${customer_phone} needs help. Reason: ${escalationResult.reason}`,
            conversationId: conversation.id,
          }).catch(() => {});
        }

        const escalationResponse = "I understand your concern. Let me connect you with one of our team members who can help you directly. Someone will reach out to you shortly!";

        await this.db.addMessage(conversation.id, 'agent', escalationResponse, {
          escalated: true,
          escalation_reason: escalationResult.reason,
          channel,
        });

        await this.sendResponse(channel, customer_phone, escalationResponse);

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

      // 5. Check for booking intent
      const bookingIntent = this.booking.detectBookingIntent(message);
      if (bookingIntent) {
        testDriveBookQueue.add('book-test-drive', {
          conversationId: conversation.id,
          dealershipId: dealership_id,
          customerPhone: customer_phone,
          vehicle: 'Vehicle TBD',
          date: bookingIntent.date.toISOString().split('T')[0],
          time: bookingIntent.date.toTimeString().substring(0, 5),
          timezone: 'America/Phoenix',
        }).catch((err) => {
          logger.warn('Failed to enqueue booking', { error: err.message });
        });

        const bookingResponse = `Great! I'm scheduling your test drive for ${bookingIntent.text}. You'll get a confirmation shortly!`;

        await this.db.addMessage(conversation.id, 'agent', bookingResponse, { channel, booking_intent: true });
        await this.sendResponse(channel, customer_phone, bookingResponse);

        return {
          success: true,
          conversation_id: conversation.id,
          response: bookingResponse,
          action_taken: 'booking_scheduled',
          qualification_score: conversation.qualification_score,
        };
      }

      // 6. Extract context from messages
      const extractedContext = this.contextExtraction.extractFromMessages(messages);
      await this.persistContext(conversation.id, extractedContext);

      // 7. Get prompt (with A/B testing)
      const promptConfig = await this.promptService.getPromptForConversation(conversation.id);
      const promptVersion = promptConfig?.version || 'default';
      const promptVariant = promptConfig?.variant || 'A';

      // 8. Generate response via Anthropic
      const startTime = Date.now();
      const { content: responseText, tokensUsed } = await this.openai.generateResponse(
        messages,
        promptConfig?.systemPrompt
      );
      const responseTimeMs = Date.now() - startTime;

      // 9. Log agent response
      await this.db.addMessage(conversation.id, 'agent', responseText, {
        tokens_used: tokensUsed,
        model_version: 'claude-3-5-haiku-latest',
        prompt_version: promptVersion,
        prompt_variant: promptVariant,
        channel,
      });

      // 10. Send response via appropriate channel
      await this.sendResponse(channel, customer_phone, responseText);

      // 11. Score the conversation for lead qualification
      const qualificationScore = await this.qualification.scoreConversation(conversation.id, messages);
      await this.db.updateQualificationScore(conversation.id, qualificationScore);

      // 12. Log analytics
      await this.analytics.logPromptMetric({
        promptVersion,
        variant: promptVariant,
        conversationId: conversation.id,
        responseTimeMs,
        inputTokens: tokensUsed.prompt,
        outputTokens: tokensUsed.completion,
        escalated: false,
      });

      // 13. Log interaction
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
        promptVersion,
        promptVariant,
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

  private async sendResponse(channel: string, to: string, message: string): Promise<void> {
    try {
      if (channel === 'sms') {
        await this.twilio.sendSMS(to, message);
      } else if (channel === 'email') {
        await this.email.sendEmail(to, 'Shiftly Auto', message);
      }
      // 'web' channel — response returned in JSON, no push needed
    } catch (error: any) {
      logger.warn('Failed to send response', { channel, to, error: error.message });
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
