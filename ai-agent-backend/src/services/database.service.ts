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

  async getDefaultDealership(): Promise<any> {
    const result = await query('SELECT * FROM dealerships WHERE active = true ORDER BY created_at LIMIT 1');
    return result.rows[0] || null;
  }
}
