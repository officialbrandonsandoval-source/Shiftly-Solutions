jest.mock('../../src/config/env', () => ({
  env: {
    PORT: '3000',
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    ANTHROPIC_API_KEY: 'sk-test-key',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'test-token',
    TWILIO_PHONE_NUMBER: '+15550001234',
    API_KEYS: 'dev-key-12345',
    WEBHOOK_BASE_URL: 'http://localhost:3000',
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  checkDatabaseHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
}));

jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    isOpen: true,
  },
  connectRedis: jest.fn().mockResolvedValue(undefined),
  checkRedisHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Thanks for reaching out! What vehicle interests you?' }],
        usage: { input_tokens: 30, output_tokens: 15 },
      }),
    },
  })),
}));

jest.mock('twilio', () => {
  const messages = { create: jest.fn().mockResolvedValue({ sid: 'SM123' }) };
  const client = { messages };
  const validateRequest = jest.fn().mockReturnValue(true);
  return Object.assign(jest.fn(() => client), { validateRequest });
});

const mockConversation = {
  id: 'conv-123',
  customer_phone: '+15551234567',
  dealership_id: 'dealer-1',
  status: 'active',
  qualification_score: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_message_at: null,
};

const mockDealership = {
  id: 'dealer-1',
  name: 'Test Motors',
  phone: '+15550001234',
  active: true,
  hours: '9am-5pm',
  personality: 'friendly',
};

const mockDbInstance = {
  findOrCreateConversation: jest.fn().mockResolvedValue(mockConversation),
  addMessage: jest.fn().mockResolvedValue({
    id: 'msg-1',
    conversation_id: 'conv-123',
    role: 'customer',
    content: 'Hi',
    metadata: null,
    created_at: new Date().toISOString(),
  }),
  getMessages: jest.fn().mockResolvedValue([
    {
      id: 'msg-1',
      conversation_id: 'conv-123',
      role: 'customer',
      content: 'Hi there',
      metadata: null,
      created_at: new Date().toISOString(),
    },
  ]),
  getConversation: jest.fn().mockResolvedValue(mockConversation),
  getConversationByPhone: jest.fn().mockResolvedValue(mockConversation),
  getDealership: jest.fn().mockResolvedValue(mockDealership),
  getDealershipByPhone: jest.fn().mockResolvedValue(mockDealership),
  getDefaultDealership: jest.fn().mockResolvedValue(mockDealership),
  updateQualificationScore: jest.fn().mockResolvedValue(undefined),
  updateConversationStatus: jest.fn().mockResolvedValue(undefined),
  logInteraction: jest.fn().mockResolvedValue(undefined),
  upsertCustomerContext: jest.fn().mockResolvedValue(undefined),
  getCustomerContext: jest.fn().mockResolvedValue([]),
};

jest.mock('../../src/services/database.service', () => ({
  DatabaseService: jest.fn().mockImplementation(() => mockDbInstance),
}));

import { AgentService } from '../../src/services/agent.service';

describe('Agent Integration', () => {
  let agentService: AgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    agentService = new AgentService();
  });

  it('should handle a basic message end-to-end', async () => {
    const result = await agentService.handleMessage({
      customer_phone: '+15551234567',
      dealership_id: 'dealer-1',
      message: 'Hi there',
      channel: 'web',
    });

    expect(result.success).toBe(true);
    expect(result.conversation_id).toBe('conv-123');
    expect(result.response).toBeDefined();
    expect(result.response.length).toBeGreaterThan(0);
    expect(result.action_taken).toBe('responded');
    expect(result.qualification_score).toBeDefined();
  });

  it('should handle SMS channel and send response via Twilio', async () => {
    const result = await agentService.handleMessage({
      customer_phone: '+15551234567',
      dealership_id: 'dealer-1',
      message: 'I want a car',
      channel: 'sms',
    });

    expect(result.success).toBe(true);
    expect(result.action_taken).toBe('responded');
  });

  it('should handle escalation when customer requests human', async () => {
    mockDbInstance.getMessages.mockResolvedValueOnce([
      {
        id: 'msg-1',
        conversation_id: 'conv-123',
        role: 'customer',
        content: 'I want to speak to a human please',
        metadata: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const result = await agentService.handleMessage({
      customer_phone: '+15551234567',
      dealership_id: 'dealer-1',
      message: 'I want to speak to a human please',
      channel: 'web',
    });

    expect(result.success).toBe(true);
    expect(result.action_taken).toBe('escalated');
    expect(result.response).toContain('connect you');
  });

  it('should return qualification score for vehicle interest', async () => {
    mockDbInstance.getMessages.mockResolvedValueOnce([
      {
        id: 'msg-1',
        conversation_id: 'conv-123',
        role: 'customer',
        content: 'I want a Toyota Camry under $30k',
        metadata: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const result = await agentService.handleMessage({
      customer_phone: '+15551234567',
      dealership_id: 'dealer-1',
      message: 'I want a Toyota Camry under $30k',
      channel: 'web',
    });

    expect(result.success).toBe(true);
    expect(result.qualification_score).toBeGreaterThan(0);
  });
});
