jest.mock('twilio', () => {
  const messages = { create: jest.fn() };
  const client = { messages };
  const validateRequest = jest.fn();

  return Object.assign(
    jest.fn(() => client),
    { validateRequest }
  );
});

jest.mock('@bandwidth/messaging', () => {
  const createMessage = jest.fn();

  return {
    Client: jest.fn(),
    ApiController: jest.fn().mockImplementation(() => ({ createMessage })),
  };
});

jest.mock('../../src/services/database.service', () => {
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      getDealershipByPhone: jest.fn().mockResolvedValue(null),
      getConversationByPhone: jest.fn().mockResolvedValue(null),
      logInteraction: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

import crypto from 'crypto';
import { SMSError } from '../../src/utils/errors';

const { TwilioAdapter } = require('../../src/services/sms/twilio.adapter');
const { BandwidthAdapter } = require('../../src/services/sms/bandwidth.adapter');
const { SMSFactory } = require('../../src/services/sms/sms.factory');

const twilio = require('twilio');
const bandwidth = require('@bandwidth/messaging');

describe('SMS Adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('factory returns Twilio adapter', () => {
    const adapter = SMSFactory.create('twilio', {
      provider: 'twilio',
      credentials: {
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: 'token',
      },
    });

    expect(adapter).toBeInstanceOf(TwilioAdapter);
  });

  it('factory returns Bandwidth adapter', () => {
    const adapter = SMSFactory.create('bandwidth', {
      provider: 'bandwidth',
      credentials: {
        BANDWIDTH_ACCOUNT_ID: 'account',
        BANDWIDTH_API_TOKEN: 'token',
        BANDWIDTH_API_SECRET: 'secret',
        BANDWIDTH_APPLICATION_ID: 'app',
      },
    });

    expect(adapter).toBeInstanceOf(BandwidthAdapter);
  });

  it('twilio adapter retries and succeeds', async () => {
    const messages = twilio().messages;
    messages.create
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValueOnce({ sid: 'SM123' });

    const adapter = new TwilioAdapter({
      provider: 'twilio',
      credentials: {
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: 'token',
      },
    });

    await adapter.sendSMS('+1555', '+1666', 'hello');
    expect(messages.create).toHaveBeenCalledTimes(3);
  });

  it('twilio adapter throws SMSError on failure', async () => {
    const messages = twilio().messages;
    messages.create.mockRejectedValue(new Error('fail'));

    const adapter = new TwilioAdapter({
      provider: 'twilio',
      credentials: {
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: 'token',
      },
    });

    await expect(adapter.sendSMS('+1555', '+1666', 'hello')).rejects.toBeInstanceOf(SMSError);
  });

  it('bandwidth adapter validates webhook signature', () => {
    const adapter = new BandwidthAdapter({
      provider: 'bandwidth',
      credentials: {
        BANDWIDTH_ACCOUNT_ID: 'account',
        BANDWIDTH_API_TOKEN: 'token',
        BANDWIDTH_API_SECRET: 'secret',
        BANDWIDTH_APPLICATION_ID: 'app',
      },
    });

    const body = { message: { text: 'hi' } };
    const timestamp = '1700000000';
    const payload = JSON.stringify(body);
    const data = `${timestamp}.${payload}`;
    const signature = crypto.createHmac('sha256', 'secret').update(data).digest('base64');

    const req: any = {
      body,
      headers: {
        'x-bandwidth-signature': signature,
        'x-bandwidth-timestamp': timestamp,
      },
    };

    expect(adapter.validateWebhook(req)).toBe(true);
  });

  it('bandwidth adapter sends message', async () => {
    const createMessage = bandwidth.ApiController().createMessage;
    createMessage.mockResolvedValue({ result: { id: 'msg' } });

    const adapter = new BandwidthAdapter({
      provider: 'bandwidth',
      credentials: {
        BANDWIDTH_ACCOUNT_ID: 'account',
        BANDWIDTH_API_TOKEN: 'token',
        BANDWIDTH_API_SECRET: 'secret',
        BANDWIDTH_APPLICATION_ID: 'app',
      },
    });

    await adapter.sendSMS('+1555', '+1666', 'hello');
    expect(createMessage).toHaveBeenCalled();
  });
});
