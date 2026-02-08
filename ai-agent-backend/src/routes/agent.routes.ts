import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AgentService } from '../services/agent.service';
import { DatabaseService } from '../services/database.service';
import { QualificationService } from '../services/qualification.service';
import { BookingService } from '../services/booking.service';
import { HandoffService } from '../services/handoff.service';
import { RoutingService } from '../services/routing.service';
import { ValidationError } from '../utils/errors';

const router = Router();
const agentService = new AgentService();
const dbService = new DatabaseService();
const qualificationService = new QualificationService();
const bookingService = new BookingService();
const handoffService = new HandoffService();
const routingService = new RoutingService();

const handleMessageSchema = z.object({
  customer_phone: z.string().min(10).max(20),
  dealership_id: z.string().min(1),
  message: z.string().min(1).max(5000),
  channel: z.enum(['sms', 'email', 'web']).default('sms'),
});

router.post('/handle-message', async (req: Request, res: Response) => {
  try {
    const parsed = handleMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(', '));
    }

    const result = await agentService.handleMessage(parsed.data);
    res.json(result);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/conversation/:customerId', async (req: Request, res: Response) => {
  try {
    const customerId = String(req.params.customerId);
    const rawDealershipId = req.query.dealership_id;
    let dealershipId: string | undefined;

    if (typeof rawDealershipId === 'string') {
      dealershipId = rawDealershipId;
    } else if (Array.isArray(rawDealershipId) && typeof rawDealershipId[0] === 'string') {
      dealershipId = rawDealershipId[0];
    }

    if (!dealershipId) {
      return res.status(400).json({ success: false, error: 'dealership_id query param required' });
    }

    const conversation = await dbService.getConversationByPhone(customerId, dealershipId as string);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messages = await dbService.getMessages(conversation.id);

    res.json({
      success: true,
      conversation: {
        ...conversation,
        messages,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// --- Phase 2-6 endpoints ---

const qualifySchema = z.object({
  conversation_id: z.string().min(1),
});

router.post('/qualify', async (req: Request, res: Response) => {
  try {
    const parsed = qualifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const messages = await dbService.getMessages(parsed.data.conversation_id);
    const score = await qualificationService.scoreConversation(parsed.data.conversation_id, messages);
    await dbService.updateQualificationScore(parsed.data.conversation_id, score);

    res.json({ success: true, conversation_id: parsed.data.conversation_id, qualification_score: score });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const bookingSchema = z.object({
  conversation_id: z.string().min(1),
  dealership_id: z.string().min(1),
  customer_phone: z.string().min(10),
  vehicle: z.string().min(1),
  preferred_date: z.string().min(1),
  preferred_time: z.string().min(1),
  timezone: z.string().default('America/Phoenix'),
  customer_name: z.string().optional(),
});

router.post('/book-test-drive', async (req: Request, res: Response) => {
  try {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const result = await bookingService.bookTestDrive({
      conversationId: parsed.data.conversation_id,
      dealershipId: parsed.data.dealership_id,
      customerPhone: parsed.data.customer_phone,
      customerName: parsed.data.customer_name,
      vehicle: parsed.data.vehicle,
      preferredDate: parsed.data.preferred_date,
      preferredTime: parsed.data.preferred_time,
      timezone: parsed.data.timezone,
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const escalateSchema = z.object({
  conversation_id: z.string().min(1),
  dealership_id: z.string().min(1),
  reason: z.string().optional(),
});

router.post('/escalate', async (req: Request, res: Response) => {
  try {
    const parsed = escalateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    await dbService.updateConversationStatus(parsed.data.conversation_id, 'escalated');
    const agent = await routingService.assignAgent(parsed.data.dealership_id, parsed.data.conversation_id);

    if (agent) {
      await handoffService.startHandoff(parsed.data.conversation_id, agent.userId);
    }

    res.json({
      success: true,
      conversation_id: parsed.data.conversation_id,
      assigned_agent: agent || null,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
