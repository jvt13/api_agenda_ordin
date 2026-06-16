import { env } from './env.js';
import type { SystemSettingKey } from './system-settings.registry.js';
import { whisperModelSchema } from './system-settings.registry.js';

export interface AppRuntimeConfig {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  STT_PROVIDER: 'local';
  STT_SERVICE_URL: string;
  STT_TIMEOUT_MS: number;
  WHISPER_MODEL: string;
  WHISPER_LANGUAGE: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
}

let runtimeConfig: AppRuntimeConfig = buildFromEnv();

function buildFromEnv(): AppRuntimeConfig {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() ?? '',
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
    STT_PROVIDER: 'local',
    STT_SERVICE_URL: process.env.STT_SERVICE_URL?.trim() || 'http://localhost:8001',
    STT_TIMEOUT_MS: env.STT_TIMEOUT_MS,
    WHISPER_MODEL: whisperModelSchema.parse(process.env.WHISPER_MODEL?.trim() || 'small'),
    WHISPER_LANGUAGE: process.env.WHISPER_LANGUAGE?.trim() || 'pt',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY?.trim() ?? '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET?.trim() ?? '',
  };
}

export function getAppConfig(): AppRuntimeConfig {
  return runtimeConfig;
}

export function applyRuntimeSettings(values: Partial<Record<SystemSettingKey, string>>): AppRuntimeConfig {
  const next = { ...runtimeConfig };

  for (const [key, value] of Object.entries(values) as [SystemSettingKey, string][]) {
    if (value === undefined) continue;

    switch (key) {
      case 'GEMINI_API_KEY':
        next.GEMINI_API_KEY = value;
        break;
      case 'GEMINI_MODEL':
        next.GEMINI_MODEL = value;
        break;
      case 'STT_PROVIDER':
        next.STT_PROVIDER = 'local';
        break;
      case 'STT_SERVICE_URL':
        next.STT_SERVICE_URL = value;
        break;
      case 'WHISPER_MODEL':
        next.WHISPER_MODEL = whisperModelSchema.parse(value);
        break;
      case 'WHISPER_LANGUAGE':
        next.WHISPER_LANGUAGE = value;
        break;
      case 'CLOUDINARY_CLOUD_NAME':
        next.CLOUDINARY_CLOUD_NAME = value;
        break;
      case 'CLOUDINARY_API_KEY':
        next.CLOUDINARY_API_KEY = value;
        break;
      case 'CLOUDINARY_API_SECRET':
        next.CLOUDINARY_API_SECRET = value;
        break;
      default:
        break;
    }
  }

  runtimeConfig = next;
  return runtimeConfig;
}

export function isCloudinaryConfigured(config: AppRuntimeConfig = runtimeConfig): boolean {
  return Boolean(
    config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET,
  );
}
