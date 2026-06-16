import { z } from 'zod';
import { loadEnv } from './load-env.js';

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.coerce.number().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
  DATABASE_SCHEMA: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  SETTINGS_ENCRYPTION_KEY: z.string().min(32),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  STT_PROVIDER: z.enum(['local']).default('local'),
  STT_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  STT_TIMEOUT_MS: z.coerce.number().default(120000),
  WHISPER_MODEL: z.enum(['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3']).default('small'),
  WHISPER_LANGUAGE: z.string().default('pt'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default('*'),
});

function parseEnv() {
  if (!process.env.PORT?.trim()) {
    throw new Error(
      'PORT não definida. Configure PORT no arquivo .env (ex.: PORT=3100).',
    );
  }

  return envSchema.parse(process.env);
}

export const env = parseEnv();
