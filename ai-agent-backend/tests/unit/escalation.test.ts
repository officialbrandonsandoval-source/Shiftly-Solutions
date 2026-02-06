import { EscalationService } from '../../src/services/escalation.service';
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

describe('EscalationService', () => {
  const service = new EscalationService();

  it('should not escalate empty messages', () => {
    const result = service.evaluate([]);
    expect(result.shouldEscalate).toBe(false);
  });

  it('should not escalate a normal conversation', () => {
    const messages = [
      makeMessage('customer', 'Hi, I am looking for a new car'),
      makeMessage('agent', 'Welcome! What type of vehicle interests you?'),
      makeMessage('customer', 'I like SUVs'),
    ];

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(false);
  });

  it('should escalate when customer explicitly requests a human', () => {
    const messages = [
      makeMessage('customer', 'Hi there'),
      makeMessage('agent', 'Hello!'),
      makeMessage('customer', 'I want to speak to a human please'),
    ];

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should escalate when customer asks for a real person', () => {
    const messages = [
      makeMessage('customer', 'Can I talk to a real person?'),
    ];

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(true);
  });

  it('should escalate on multiple frustration signals', () => {
    const messages = [
      makeMessage('customer', 'This is ridiculous, I want to speak to a manager'),
    ];

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should escalate on complex topics', () => {
    const messages = [
      makeMessage('customer', 'I need to file a warranty claim for my vehicle'),
    ];

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(true);
    expect(result.reason).toContain('Complex topic');
  });

  it('should escalate when customer repeats themselves', () => {
    const messages = [
      makeMessage('customer', 'What are your hours?'),
      makeMessage('agent', 'We are open 9-5!'),
      makeMessage('customer', 'What are your hours?'),
      makeMessage('agent', 'Monday through Friday, 9am to 5pm!'),
      makeMessage('customer', 'What are your hours?'),
    ];

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(true);
  });

  it('should escalate on legal/dispute topics', () => {
    const messages = [
      makeMessage('customer', 'I want to know about lemon law for my car'),
    ];

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(true);
  });

  it('should escalate very long conversations', () => {
    const topics = [
      'Tell me about your SUV lineup',
      'What colors do you have for sedans?',
      'Do you offer extended warranties?',
      'What financing rates are available?',
      'Can you tell me about the Camry features?',
      'How does the hybrid engine work?',
      'What safety features come standard?',
      'Do you have any trucks in stock?',
      'What about certified pre-owned options?',
      'Tell me about your service department hours',
      'What maintenance packages do you offer?',
      'How does the trade-in valuation process work here?',
      'Can I get more details on the lease terms?',
      'What accessories can I add to a new vehicle?',
      'Do you deliver vehicles to other states?',
      'What is the process for ordering a custom build?',
    ];

    const messages: Message[] = [];
    for (let i = 0; i < topics.length; i++) {
      messages.push(makeMessage('customer', topics[i]));
      messages.push(makeMessage('agent', `Here is info about that topic`));
    }

    const result = service.evaluate(messages);
    expect(result.shouldEscalate).toBe(true);
    expect(result.reason).toContain('Long conversation');
  });
});
