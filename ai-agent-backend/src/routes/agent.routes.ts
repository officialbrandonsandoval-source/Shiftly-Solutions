import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AgentService } from '../services/agent.service';
import { DatabaseService } from '../services/database.service';
import { ValidationError } from '../utils/errors';

const router = Router();
const agentService = new AgentService();
const dbService = new DatabaseService();

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

export default router;
