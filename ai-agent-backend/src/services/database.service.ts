import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { Conversation, Message, CustomerContext } from '../types/conversation';
import { logger } from '../utils/logger';

export class DatabaseService {
  async findOrCreateConversation(customerPhone: string, dealershipId: string): Promise<Conversation> {
    // Try to find existing active conversation
    const existing = await query(
      `SELECT * FROM conversations
       WHERE customer_phone = $1 AND dealership_id = $2 AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
      [customerPhone, dealershipId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new conversation
    const id = uuidv4();
    const result = await query(
      `INSERT INTO conversations (id, customer_phone, dealership_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [id, customerPhone, dealershipId]
    );

    logger.info('New conversation created', { id, customerPhone, dealershipId });
    return result.rows[0];
  }

  async addMessage(conversationId: string, role: string, content: string, metadata?: Record<string, unknown>): Promise<Message> {
    const id = uuidv4();
    const result = await query(
      `INSERT INTO messages (id, conversation_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, conversationId, role, content, metadata ? JSON.stringify(metadata) : null]
    );

    // Update conversation timestamp
    await query(
      `UPDATE conversations SET updated_at = NOW(), last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    return result.rows[0];
  }

  async getMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
    const result = await query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit]
    );
    return result.rows;
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const result = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    return result.rows[0] || null;
  }

  async getConversationByPhone(customerPhone: string, dealershipId: string): Promise<Conversation | null> {
    const result = await query(
      `SELECT * FROM conversations
       WHERE customer_phone = $1 AND dealership_id = $2 AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
      [customerPhone, dealershipId]
    );
    return result.rows[0] || null;
  }

  async updateQualificationScore(conversationId: string, score: number): Promise<void> {
    await query(
      `UPDATE conversations SET qualification_score = $1, updated_at = NOW() WHERE id = $2`,
      [score, conversationId]
    );
  }

  async logInteraction(
    conversationId: string,
    interactionType: string,
    success: boolean,
    metadata?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void> {
    await query(
      `INSERT INTO interactions (id, conversation_id, interaction_type, success, metadata, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), conversationId, interactionType, success, metadata ? JSON.stringify(metadata) : null, errorMessage]
    );
  }

  async getDealership(dealershipId: string): Promise<any> {
    const result = await query('SELECT * FROM dealerships WHERE id = $1 AND active = true', [dealershipId]);
    return result.rows[0] || null;
  }

  async getDealershipByPhone(phone: string): Promise<any> {
    const result = await query('SELECT * FROM dealerships WHERE phone = $1 AND active = true', [phone]);
    return result.rows[0] || null;
  }

  async getDefaultDealership(): Promise<any> {
    const result = await query('SELECT * FROM dealerships WHERE active = true ORDER BY created_at LIMIT 1');
    return result.rows[0] || null;
  }

  async upsertCustomerContext(
    conversationId: string,
    contextType: string,
    contextValue: Record<string, unknown>,
    confidence: number
  ): Promise<void> {
    const existing = await query(
      `SELECT id FROM customer_context WHERE conversation_id = $1 AND context_type = $2`,
      [conversationId, contextType]
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE customer_context SET context_value = $1, confidence = $2, updated_at = NOW()
         WHERE conversation_id = $3 AND context_type = $4`,
        [JSON.stringify(contextValue), confidence, conversationId, contextType]
      );
    } else {
      await query(
        `INSERT INTO customer_context (id, conversation_id, context_type, context_value, confidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), conversationId, contextType, JSON.stringify(contextValue), confidence]
      );
    }
  }

  async getCustomerContext(conversationId: string): Promise<CustomerContext[]> {
    const result = await query(
      `SELECT * FROM customer_context WHERE conversation_id = $1 ORDER BY updated_at DESC`,
      [conversationId]
    );
    return result.rows;
  }

  async updateConversationStatus(conversationId: string, status: 'active' | 'escalated' | 'closed' | 'human_active'): Promise<void> {
    await query(
      `UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, conversationId]
    );
  }

  // --- Phase 2-6 additions ---

  async createJobLog(queueName: string, jobId: string, payload: unknown): Promise<string> {
    const id = uuidv4();
    await query(
      `INSERT INTO job_logs (id, queue_name, job_id, status, payload) VALUES ($1, $2, $3, 'processing', $4)`,
      [id, queueName, jobId, JSON.stringify(payload)]
    );
    return id;
  }

  async updateJobLog(logId: string, status: string, result?: Record<string, unknown>, error?: string): Promise<void> {
    await query(
      `UPDATE job_logs SET status = $1, result = $2, error = $3, completed_at = NOW() WHERE id = $4`,
      [status, result ? JSON.stringify(result) : null, error || null, logId]
    );
  }

  async createBooking(data: {
    conversationId: string;
    dealershipId: string;
    customerPhone: string;
    customerName?: string;
    vehicle: string;
    scheduledDate: string;
    scheduledTime: string;
    calendarEventId?: string;
  }): Promise<string> {
    const id = uuidv4();
    await query(
      `INSERT INTO bookings (id, conversation_id, dealership_id, customer_phone, customer_name, vehicle, scheduled_date, scheduled_time, calendar_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, data.conversationId, data.dealershipId, data.customerPhone, data.customerName || null, data.vehicle, data.scheduledDate, data.scheduledTime, data.calendarEventId || null]
    );
    return id;
  }

  async getActiveDealershipUsers(dealershipId: string): Promise<Array<{ id: string; name: string; email: string; phone: string | null; role: string }>> {
    const result = await query(
      `SELECT id, name, email, phone, role FROM dealership_users WHERE dealership_id = $1 AND active = true ORDER BY created_at`,
      [dealershipId]
    );
    return result.rows;
  }

  async updateDealershipCrmConfig(dealershipId: string, crmType: string, config: Record<string, unknown>): Promise<void> {
    await query(
      `UPDATE dealerships SET crm_type = $1, crm_config = $2 WHERE id = $3`,
      [crmType, JSON.stringify(config), dealershipId]
    );
  }

  async getActivePrompt(): Promise<any> {
    const result = await query(
      `SELECT * FROM agent_prompts WHERE active = true ORDER BY created_at DESC LIMIT 1`
    );
    return result.rows[0] || null;
  }

  async getPromptByVariant(version: string, variant: string): Promise<any> {
    const result = await query(
      `SELECT * FROM agent_prompts WHERE version = $1 AND variant = $2 LIMIT 1`,
      [version, variant]
    );
    return result.rows[0] || null;
  }

  async insertPromptMetric(params: {
    promptVersion: string;
    variant: string;
    conversationId: string;
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    qualificationDelta?: number;
    escalated?: boolean;
  }): Promise<void> {
    await query(
      `INSERT INTO prompt_metrics (id, prompt_version, variant, conversation_id, response_time_ms, input_tokens, output_tokens, qualification_delta, escalated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(),
        params.promptVersion,
        params.variant,
        params.conversationId,
        params.responseTimeMs,
        params.inputTokens,
        params.outputTokens,
        params.qualificationDelta ?? null,
        params.escalated ?? false,
      ]
    );
  }

  async closeStaleConversations(maxAgeDays: number = 90): Promise<number> {
    const result = await query(
      `UPDATE conversations SET status = 'closed', updated_at = NOW()
       WHERE status = 'active' AND updated_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [maxAgeDays]
    );
    return result.rowCount || 0;
  }

  async findOrCreateConversationWithFlag(customerPhone: string, dealershipId: string): Promise<{ conversation: Conversation; isNew: boolean }> {
    const existing = await query(
      `SELECT * FROM conversations
       WHERE customer_phone = $1 AND dealership_id = $2 AND status IN ('active', 'human_active')
       ORDER BY updated_at DESC LIMIT 1`,
      [customerPhone, dealershipId]
    );

    if (existing.rows.length > 0) {
      return { conversation: existing.rows[0], isNew: false };
    }

    const id = uuidv4();
    const result = await query(
      `INSERT INTO conversations (id, customer_phone, dealership_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [id, customerPhone, dealershipId]
    );

    logger.info('New conversation created', { id, customerPhone, dealershipId });
    return { conversation: result.rows[0], isNew: true };
  }
}
