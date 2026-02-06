import { ContextExtractionService } from '../../src/services/context.service';
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

describe('ContextExtractionService', () => {
  const service = new ContextExtractionService();

  it('should return empty context for no messages', () => {
    const result = service.extractFromMessages([]);
    expect(result).toEqual({});
  });

  it('should return empty context for only agent messages', () => {
    const messages = [makeMessage('agent', 'Welcome! Looking for a Toyota?')];
    const result = service.extractFromMessages(messages);
    expect(result).toEqual({});
  });

  it('should extract vehicle make', () => {
    const messages = [makeMessage('customer', 'I am interested in a Toyota')];
    const result = service.extractFromMessages(messages);
    expect(result.vehicle_interest).toBeDefined();
    expect(result.vehicle_interest!.make).toBeDefined();
  });

  it('should extract vehicle type', () => {
    const messages = [makeMessage('customer', 'I need an SUV for my family')];
    const result = service.extractFromMessages(messages);
    expect(result.vehicle_interest).toBeDefined();
    expect(result.vehicle_interest!.type).toBeDefined();
  });

  it('should extract vehicle condition', () => {
    const messages = [makeMessage('customer', 'Looking for a used Honda')];
    const result = service.extractFromMessages(messages);
    expect(result.vehicle_interest).toBeDefined();
    expect(result.vehicle_interest!.condition).toBeDefined();
  });

  it('should extract budget with dollar amount', () => {
    const messages = [makeMessage('customer', 'My budget is $30,000')];
    const result = service.extractFromMessages(messages);
    expect(result.budget).toBeDefined();
    expect(result.budget!.total).toBe(30000);
  });

  it('should extract budget with k notation', () => {
    const messages = [makeMessage('customer', 'I can spend around 25k')];
    const result = service.extractFromMessages(messages);
    expect(result.budget).toBeDefined();
    expect(result.budget!.total).toBe(25000);
  });

  it('should extract monthly payment', () => {
    const messages = [makeMessage('customer', 'I can do $400/mo')];
    const result = service.extractFromMessages(messages);
    expect(result.budget).toBeDefined();
    expect(result.budget!.monthly_payment).toBe(400);
  });

  it('should extract payment method', () => {
    const messages = [makeMessage('customer', 'I want to lease a car')];
    const result = service.extractFromMessages(messages);
    expect(result.budget).toBeDefined();
    expect(result.budget!.payment_method).toBe('lease');
  });

  it('should extract urgent timeline', () => {
    const messages = [makeMessage('customer', 'I need a car today')];
    const result = service.extractFromMessages(messages);
    expect(result.timeline).toBeDefined();
    expect(result.timeline!.urgency).toBe('immediate');
  });

  it('should extract browsing timeline', () => {
    const messages = [makeMessage('customer', 'I am just looking for now')];
    const result = service.extractFromMessages(messages);
    expect(result.timeline).toBeDefined();
    expect(result.timeline!.urgency).toBe('browsing');
  });

  it('should extract trade-in intent', () => {
    const messages = [makeMessage('customer', 'I want to trade in my old car')];
    const result = service.extractFromMessages(messages);
    expect(result.trade_in).toBeDefined();
    expect(result.trade_in!.has_trade_in).toBe(true);
  });

  it('should not extract trade-in without intent keywords', () => {
    const messages = [makeMessage('customer', 'I want a new car')];
    const result = service.extractFromMessages(messages);
    expect(result.trade_in).toBeUndefined();
  });

  it('should extract multiple context types from a conversation', () => {
    const messages = [
      makeMessage('customer', 'I want a used Toyota SUV'),
      makeMessage('agent', 'Great! What is your budget?'),
      makeMessage('customer', 'Around $30,000 and I want to finance. Need it this week.'),
      makeMessage('agent', 'Do you have a trade-in?'),
      makeMessage('customer', 'Yes I want to trade in my Honda Civic'),
    ];

    const result = service.extractFromMessages(messages);
    expect(result.vehicle_interest).toBeDefined();
    expect(result.budget).toBeDefined();
    expect(result.timeline).toBeDefined();
    expect(result.trade_in).toBeDefined();
  });
});
