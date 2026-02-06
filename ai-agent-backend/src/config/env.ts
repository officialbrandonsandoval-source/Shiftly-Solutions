import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_PHONE_NUMBER: optionalString,
  BANDWIDTH_ACCOUNT_ID: optionalString,
  BANDWIDTH_API_TOKEN: optionalString,
  BANDWIDTH_API_SECRET: optionalString,
  BANDWIDTH_APPLICATION_ID: optionalString,
  GHL_API_KEY: optionalString,
  GHL_LOCATION_ID: optionalString,
  GHL_CALENDAR_ID: optionalString,
  SENTRY_DSN: z.string().optional(),
  WEBHOOK_BASE_URL: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
