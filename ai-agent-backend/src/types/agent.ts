export interface AgentDecision {
  action: 'respond' | 'book' | 'escalate' | 'qualify';
  confidence: number;
  reasoning: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  success: boolean;
  conversation_id: string;
  response: string;
  action_taken: string;
  qualification_score: number | null;
}

export interface IncomingMessage {
  customer_phone: string;
  dealership_id: string;
  message: string;
  channel: 'sms' | 'email' | 'web';
}
