// Mock env before importing queue config
jest.mock('../../src/config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'development',
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

// Mock BullMQ Queue to prevent real Redis connections
const mockOn = jest.fn();
const mockAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: mockAdd,
    on: mockOn,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

import { Queue } from 'bullmq';

describe('Queue Configuration', () => {
  let queueModule: typeof import('../../src/config/queue');

  beforeAll(async () => {
    queueModule = await import('../../src/config/queue');
  });

  it('should define all queue names', () => {
    expect(queueModule.QUEUE_NAMES).toEqual({
      CRM_SYNC: 'crm-sync',
      TEST_DRIVE_BOOK: 'test-drive-book',
      NOTIFICATION: 'notification',
      ANALYTICS: 'analytics',
    });
  });

  it('should parse Redis connection from REDIS_URL', () => {
    expect(queueModule.connection).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
  });

  it('should create crm-sync queue', () => {
    expect(Queue).toHaveBeenCalledWith(
      'crm-sync',
      expect.objectContaining({
        connection: expect.objectContaining({ host: 'localhost' }),
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      })
    );
  });

  it('should create test-drive-book queue', () => {
    expect(Queue).toHaveBeenCalledWith(
      'test-drive-book',
      expect.objectContaining({
        connection: expect.objectContaining({ host: 'localhost' }),
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
        }),
      })
    );
  });

  it('should create notification queue', () => {
    expect(Queue).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({
        connection: expect.objectContaining({ host: 'localhost' }),
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }),
      })
    );
  });

  it('should create analytics queue with 2 attempts', () => {
    expect(Queue).toHaveBeenCalledWith(
      'analytics',
      expect.objectContaining({
        defaultJobOptions: expect.objectContaining({
          attempts: 2,
        }),
      })
    );
  });

  it('should register error handlers on all queues', () => {
    // Each queue should have .on('error', ...) called
    const errorCalls = mockOn.mock.calls.filter(
      (call: unknown[]) => call[0] === 'error'
    );
    expect(errorCalls.length).toBe(4);
  });

  it('should export queue instances', () => {
    expect(queueModule.crmSyncQueue).toBeDefined();
    expect(queueModule.testDriveBookQueue).toBeDefined();
    expect(queueModule.notificationQueue).toBeDefined();
    expect(queueModule.analyticsQueue).toBeDefined();
  });
});

describe('Queue Configuration — TLS', () => {
  beforeAll(() => {
    jest.resetModules();
  });

  it('should enable TLS for rediss:// URLs', async () => {
    jest.doMock('../../src/config/env', () => ({
      env: {
        REDIS_URL: 'rediss://user:secret@prod-redis.example.com:6380',
        NODE_ENV: 'production',
      },
    }));

    const mod = await import('../../src/config/queue');
    expect(mod.connection).toEqual({
      host: 'prod-redis.example.com',
      port: 6380,
      password: 'secret',
      tls: {},
    });
  });
});
