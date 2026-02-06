import { QualificationService } from '../../src/services/qualification.service';
import { Message } from '../../src/types/conversation';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function makeMessage(role: 'customer' | 'agent', content: string): Message {
  return {
    id: Math.random().toString(),
    conversation_id: 'conv-1',
    role,
    content,
    metadata: null,
    created_at: new Date().toISOString(),
  };
}

describe('QualificationService', () => {
  const service = new QualificationService();

  it('should return 0 for no messages', async () => {
    const score = await service.scoreConversation('conv-1', []);
    expect(score).toBe(0);
  });

  it('should return 0 for undefined messages', async () => {
    const score = await service.scoreConversation('conv-1');
    expect(score).toBe(0);
  });

  it('should return 0 for only agent messages', async () => {
    const messages = [makeMessage('agent', 'Welcome to our dealership!')];
    const score = await service.scoreConversation('conv-1', messages);
    expect(score).toBe(0);
  });

  it('should score vehicle interest', async () => {
    const messages = [makeMessage('customer', 'I want a Toyota Camry')];
    const score = await service.scoreConversation('conv-1', messages);
    expect(score).toBeGreaterThan(0);
  });

  it('should score budget mentions with dollar amounts higher', async () => {
    const messagesWithAmount = [makeMessage('customer', 'My budget is $30,000')];
    const messagesWithKeyword = [makeMessage('customer', 'I need to think about the budget')];

    const scoreWithAmount = await service.scoreConversation('conv-1', messagesWithAmount);
    const scoreWithKeyword = await service.scoreConversation('conv-1', messagesWithKeyword);

    expect(scoreWithAmount).toBeGreaterThan(scoreWithKeyword);
  });

  it('should score urgent timeline higher than browsing', async () => {
    const urgentMessages = [makeMessage('customer', 'I need a car today')];
    const browsingMessages = [makeMessage('customer', 'I am just looking around')];

    const urgentScore = await service.scoreConversation('conv-1', urgentMessages);
    const browsingScore = await service.scoreConversation('conv-1', browsingMessages);

    expect(urgentScore).toBeGreaterThan(browsingScore);
  });

  it('should score trade-in mentions', async () => {
    const messages = [makeMessage('customer', 'I want to trade in my current car')];
    const score = await service.scoreConversation('conv-1', messages);
    expect(score).toBeGreaterThan(0);
  });

  it('should score engagement based on message count', async () => {
    const fewMessages = [makeMessage('customer', 'Hello')];
    const manyMessages = Array.from({ length: 10 }, (_, i) =>
      makeMessage('customer', `Message ${i}`)
    );

    const fewScore = await service.scoreConversation('conv-1', fewMessages);
    const manyScore = await service.scoreConversation('conv-1', manyMessages);

    expect(manyScore).toBeGreaterThan(fewScore);
  });

  it('should produce a high score for a qualified lead', async () => {
    const messages = [
      makeMessage('customer', 'I am looking for a new Toyota Camry sedan'),
      makeMessage('agent', 'Great choice! What is your budget?'),
      makeMessage('customer', 'My budget is around $35,000 and I want to finance'),
      makeMessage('agent', 'When are you looking to purchase?'),
      makeMessage('customer', 'I need something this week, and I want to trade in my Honda Civic'),
    ];

    const score = await service.scoreConversation('conv-1', messages);
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it('should cap at 100', async () => {
    const messages = [
      makeMessage('customer', 'I need a new Toyota Camry sedan SUV truck today'),
      makeMessage('customer', 'My budget is $50,000 financing with monthly payment of $500/mo'),
      makeMessage('customer', 'I want to trade in my current car, trading in my Honda'),
      makeMessage('customer', 'I need it asap right now'),
      makeMessage('customer', 'Message 5'),
      makeMessage('customer', 'Message 6'),
      makeMessage('customer', 'Message 7'),
      makeMessage('customer', 'Message 8'),
      makeMessage('customer', 'Message 9'),
      makeMessage('customer', 'Message 10'),
    ];

    const score = await service.scoreConversation('conv-1', messages);
    expect(score).toBeLessThanOrEqual(100);
  });
});
