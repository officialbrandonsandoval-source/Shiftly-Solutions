const BASE_PROMPT = `You are a friendly, professional car dealership assistant named Shiftly. You help customers find the right vehicle and schedule test drives.

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

export interface DealershipInfo {
  name?: string;
  hours?: string;
  personality?: string;
  phone?: string;
}

export interface ConversationContext {
  qualificationScore?: number;
  vehicleInterest?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  tradeIn?: Record<string, unknown>;
}

export function buildSystemPrompt(
  dealership?: DealershipInfo | null,
  context?: ConversationContext | null
): string {
  const parts: string[] = [BASE_PROMPT];

  if (dealership) {
    const dealershipSection: string[] = [];

    if (dealership.name) {
      dealershipSection.push(`You work at ${dealership.name}.`);
    }
    if (dealership.hours) {
      dealershipSection.push(`Business hours: ${dealership.hours}.`);
    }
    if (dealership.personality) {
      dealershipSection.push(`Dealership personality: ${dealership.personality}`);
    }
    if (dealership.phone) {
      dealershipSection.push(`Dealership phone: ${dealership.phone}`);
    }

    if (dealershipSection.length > 0) {
      parts.push(`\nDEALERSHIP INFO:\n${dealershipSection.join('\n')}`);
    }
  }

  if (context) {
    const contextSection: string[] = [];

    if (context.qualificationScore !== undefined && context.qualificationScore > 0) {
      contextSection.push(`Lead score: ${context.qualificationScore}/100`);
      if (context.qualificationScore >= 60) {
        contextSection.push('This is a HOT lead — be attentive and move toward booking.');
      }
    }

    if (context.vehicleInterest && Object.keys(context.vehicleInterest).length > 0) {
      const vi = context.vehicleInterest;
      const vehicleParts: string[] = [];
      if (vi.make) vehicleParts.push(String(vi.make));
      if (vi.model) vehicleParts.push(String(vi.model));
      if (vi.type) vehicleParts.push(String(vi.type));
      if (vi.condition) vehicleParts.push(String(vi.condition));
      if (vehicleParts.length > 0) {
        contextSection.push(`Customer interested in: ${vehicleParts.join(' ')}`);
      }
    }

    if (context.budget && Object.keys(context.budget).length > 0) {
      const b = context.budget;
      if (b.total) contextSection.push(`Budget: $${b.total}`);
      if (b.monthly_payment) contextSection.push(`Monthly budget: $${b.monthly_payment}/mo`);
      if (b.payment_method) contextSection.push(`Payment: ${b.payment_method}`);
    }

    if (context.timeline && Object.keys(context.timeline).length > 0) {
      const t = context.timeline;
      if (t.urgency) contextSection.push(`Timeline: ${t.urgency}`);
    }

    if (context.tradeIn && Object.keys(context.tradeIn).length > 0) {
      contextSection.push('Customer has a trade-in.');
    }

    if (contextSection.length > 0) {
      parts.push(`\nCUSTOMER CONTEXT (use this to personalize your response):\n${contextSection.join('\n')}`);
    }
  }

  return parts.join('\n');
}
