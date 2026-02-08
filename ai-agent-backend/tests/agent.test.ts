import { AnthropicService } from '../src/services/anthropic.service';

// Mock env before any imports that depend on it
jest.mock('../src/config/env', () => ({
  env: {
    PORT: '3000',
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    ANTHROPIC_API_KEY: 'test-key',
    WEBHOOK_BASE_URL: 'http://localhost:3000',
  },
}));

// We'll mock Anthropic for unit tests
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Test response from agent' }],
          usage: { input_tokens: 50, output_tokens: 20 },
        }),
      },
    })),
  };
});

describe('AnthropicService', () => {
  const service = new AnthropicService();

  it('should generate a response', async () => {
    const messages = [
      { id: '1', conversation_id: '1', role: 'customer' as const, content: 'I want a Camry', metadata: null, created_at: new Date().toISOString() },
    ];

    const result = await service.generateResponse(messages);
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('should return fallback for price questions when Anthropic fails', () => {
    const messages = [
      { id: '1', conversation_id: '1', role: 'customer' as const, content: 'How much does it cost?', metadata: null, created_at: new Date().toISOString() },
    ];

    // Access private method via any cast for testing
    const fallback = (service as any).generateFallbackResponse(messages);
    expect(fallback).toContain('pricing');
  });

  it('should return fallback for test drive questions when Anthropic fails', () => {
    const messages = [
      { id: '1', conversation_id: '1', role: 'customer' as const, content: 'Can I schedule a test drive?', metadata: null, created_at: new Date().toISOString() },
    ];

    const fallback = (service as any).generateFallbackResponse(messages);
    expect(fallback).toContain('test drive');
  });
});
