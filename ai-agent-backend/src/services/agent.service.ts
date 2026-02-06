import { DatabaseService } from './database.service';
import { AnthropicService } from './anthropic.service';
import { TwilioService } from './twilio.service';
import { QualificationService } from './qualification.service';
import { ContextExtractionService, ExtractedContext } from './context.service';
import { EscalationService } from './escalation.service';
import { AgentResponse, IncomingMessage } from '../types/agent';
import { redis } from '../config/redis';
import { addCRMSyncJob, addBookingJob, addNotificationJob } from '../config/queue';
import { buildSystemPrompt } from '../utils/prompts';
import { logger } from '../utils/logger';

const CACHE_TTL = 60 * 60 * 24; // 24 hours

interface CachedConversation {
  conversationId: string;
  qualificationScore: number;
  vehicleInterest: Record<string, unknown> | null;
}

export class AgentService {
  private db: DatabaseService;
  private anthropic: AnthropicService;
  private twilio: TwilioService;
  private qualification: QualificationService;
  private contextExtraction: ContextExtractionService;
  private escalation: EscalationService;

  constructor() {
    this.db = new DatabaseService();
    this.anthropic = new AnthropicService();
    this.twilio = new TwilioService();
    this.qualification = new QualificationService();
    this.contextExtraction = new ContextExtractionService();
    this.escalation = new EscalationService();
  }

  async handleMessage(incoming: IncomingMessage): Promise<AgentResponse> {
    const { customer_phone, dealership_id, message, channel } = incoming;

    try {
      // 1. Find or create conversation (check cache first)
      const cached = await this.getCachedConversation(customer_phone, dealership_id);
      const conversation = cached
        ? await this.db.getConversation(cached.conversationId) ??
          await this.db.findOrCreateConversation(customer_phone, dealership_id)
        : await this.db.findOrCreateConversation(customer_phone, dealership_id);

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

        // Queue escalation notification
        await addNotificationJob({
          type: 'escalation',
          conversationId: conversation.id,
          dealershipId: dealership_id,
          recipient: customer_phone,
          metadata: {
            reason: escalationResult.reason,
            confidence: escalationResult.confidence,
          },
        });

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

      // 6. Build dynamic prompt with dealership + context info
      const dealership = await this.db.getDealership(dealership_id);
      const systemPrompt = buildSystemPrompt(
        dealership ? {
          name: dealership.name,
          hours: dealership.hours,
          personality: dealership.personality,
          phone: dealership.phone,
        } : null,
        {
          qualificationScore: conversation.qualification_score ?? 0,
          vehicleInterest: extractedContext.vehicle_interest,
          budget: extractedContext.budget,
          timeline: extractedContext.timeline,
          tradeIn: extractedContext.trade_in,
        }
      );

      // 7. Generate response via Anthropic
      const { content: responseText, tokensUsed } = await this.anthropic.generateResponse(messages, systemPrompt);

      // 8. Log agent response
      await this.db.addMessage(conversation.id, 'agent', responseText, {
        tokens_used: tokensUsed,
        model_version: 'claude-3-5-haiku-latest',
        channel,
      });

      // 9. Send SMS response (if SMS channel)
      if (channel === 'sms') {
        await this.twilio.sendSMS(customer_phone, responseText);
      }

      // 10. Score the conversation for lead qualification
      const qualificationScore = await this.qualification.scoreConversation(conversation.id, messages);
      await this.db.updateQualificationScore(conversation.id, qualificationScore);

      // 11. Queue async jobs based on qualification and context
      await this.dispatchQueueJobs(
        conversation.id,
        dealership_id,
        customer_phone,
        qualificationScore,
        extractedContext
      );

      // 12. Update Redis cache
      await this.setCachedConversation(customer_phone, dealership_id, {
        conversationId: conversation.id,
        qualificationScore,
        vehicleInterest: extractedContext.vehicle_interest || null,
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

  private async dispatchQueueJobs(
    conversationId: string,
    dealershipId: string,
    customerPhone: string,
    qualificationScore: number,
    context: ExtractedContext
  ): Promise<void> {
    // CRM sync for qualified leads
    if (qualificationScore >= 60) {
      await addCRMSyncJob({
        conversationId,
        dealershipId,
        customerPhone,
        action: 'create',
        qualificationScore,
        context: context.vehicle_interest,
      });
    }

    // Booking job for urgent timelines
    const urgency = context.timeline?.urgency as string | undefined;
    if (urgency === 'immediate' || urgency === 'this_week') {
      await addBookingJob({
        conversationId,
        customerId: customerPhone,
        dealershipId,
        vehicleInterest: this.formatVehicleInterest(context.vehicle_interest),
        preferredDate: urgency === 'immediate' ? 'today' : 'this_week',
      });
    }

    // Notify on high-score leads
    if (qualificationScore >= 80) {
      await addNotificationJob({
        type: 'high_score_lead',
        conversationId,
        dealershipId,
        recipient: customerPhone,
        metadata: { qualificationScore },
      });
    }
  }

  private formatVehicleInterest(vi?: Record<string, unknown>): string {
    if (!vi) return 'Vehicle TBD';
    const parts: string[] = [];
    if (vi.condition) parts.push(String(vi.condition));
    if (vi.make) parts.push(String(vi.make));
    if (vi.model) parts.push(String(vi.model));
    if (vi.type) parts.push(String(vi.type));
    return parts.length > 0 ? parts.join(' ') : 'Vehicle TBD';
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

  private cacheKey(phone: string, dealershipId: string): string {
    return `conv:${phone}:${dealershipId}`;
  }

  private async getCachedConversation(phone: string, dealershipId: string): Promise<CachedConversation | null> {
    try {
      const data = await redis.get(this.cacheKey(phone, dealershipId));
      if (data) {
        logger.debug('Cache hit for conversation', { phone, dealershipId });
        return JSON.parse(data);
      }
    } catch (error: any) {
      logger.warn('Redis cache read failed, falling back to DB', { error: error.message });
    }
    return null;
  }

  private async setCachedConversation(phone: string, dealershipId: string, data: CachedConversation): Promise<void> {
    try {
      await redis.set(this.cacheKey(phone, dealershipId), JSON.stringify(data), { EX: CACHE_TTL });
      logger.debug('Conversation cached', { phone, dealershipId, conversationId: data.conversationId });
    } catch (error: any) {
      logger.warn('Redis cache write failed', { error: error.message });
    }
  }
}
