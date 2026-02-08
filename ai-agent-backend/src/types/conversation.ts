export interface Conversation {
  id: string;
  customer_phone: string;
  dealership_id: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'escalated' | 'closed' | 'human_active';
  qualification_score: number | null;
  last_message_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'customer' | 'agent' | 'human';
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CustomerContext {
  id: string;
  conversation_id: string;
  context_type: 'vehicle_interest' | 'budget' | 'timeline' | 'trade_in';
  context_value: Record<string, unknown>;
  confidence: number | null;
  extracted_at: string;
  updated_at: string;
}

export interface ConversationState {
  conversation_id: string;
  customer_phone: string;
  dealership_id: string;
  messages: Message[];
  context: {
    vehicle_interest?: Record<string, unknown>;
    budget?: Record<string, unknown>;
    timeline?: Record<string, unknown>;
    trade_in?: Record<string, unknown>;
  };
  qualification_score: number;
  last_agent_action: string;
  updated_at: string;
}
