import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AgentService } from '../services/agent.service';
import { ValidationError } from '../utils/errors';

const router = Router();
const agentService = new AgentService();

const chatMessageSchema = z.object({
  customer_phone: z.string().min(1),
  dealership_id: z.string().min(1),
  message: z.string().min(1).max(5000),
});

router.post('/message', async (req: Request, res: Response) => {
  try {
    const parsed = chatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const result = await agentService.handleMessage({
      ...parsed.data,
      channel: 'web',
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
