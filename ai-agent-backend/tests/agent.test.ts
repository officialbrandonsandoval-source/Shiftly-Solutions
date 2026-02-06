import { OpenAIService } from '../src/services/openai.service';

// We'll mock OpenAI for unit tests
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response from agent' } }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        }),
      },
    },
  }));
});

describe('OpenAIService', () => {
  const service = new OpenAIService();

  it('should generate a response', async () => {
    const messages = [
      { id: '1', conversation_id: '1', role: 'customer' as const, content: 'I want a Camry', metadata: null, created_at: new Date().toISOString() },
    ];

    const result = await service.generateResponse(messages);
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('should return fallback for price questions when OpenAI fails', () => {
    const messages = [
      { id: '1', conversation_id: '1', role: 'customer' as const, content: 'How much does it cost?', metadata: null, created_at: new Date().toISOString() },
    ];

    // Access private method via any cast for testing
    const fallback = (service as any).generateFallbackResponse(messages);
    expect(fallback).toContain('pricing');
  });

  it('should return fallback for test drive questions when OpenAI fails', () => {
    const messages = [
      { id: '1', conversation_id: '1', role: 'customer' as const, content: 'Can I schedule a test drive?', metadata: null, created_at: new Date().toISOString() },
    ];

    const fallback = (service as any).generateFallbackResponse(messages);
    expect(fallback).toContain('test drive');
  });
});
