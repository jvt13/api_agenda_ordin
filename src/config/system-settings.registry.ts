import { z } from 'zod';

export const whisperModelSchema = z.enum([
  'tiny',
  'base',
  'small',
  'medium',
  'large-v2',
  'large-v3',
]);

export const SYSTEM_SETTING_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'STT_PROVIDER',
  'STT_SERVICE_URL',
  'WHISPER_MODEL',
  'WHISPER_LANGUAGE',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

export type SystemSettingKey = (typeof SYSTEM_SETTING_KEYS)[number];

export interface SystemSettingDefinition {
  key: SystemSettingKey;
  label: string;
  description: string;
  isSecret: boolean;
  group: 'gemini' | 'stt' | 'cloudinary';
}

export const SYSTEM_SETTING_DEFINITIONS: Record<SystemSettingKey, SystemSettingDefinition> = {
  GEMINI_API_KEY: {
    key: 'GEMINI_API_KEY',
    label: 'Gemini API Key',
    description: 'Chave Google AI Studio para interpretação de texto',
    isSecret: true,
    group: 'gemini',
  },
  GEMINI_MODEL: {
    key: 'GEMINI_MODEL',
    label: 'Gemini Model',
    description: 'Modelo Gemini para estruturação de tarefas',
    isSecret: false,
    group: 'gemini',
  },
  STT_PROVIDER: {
    key: 'STT_PROVIDER',
    label: 'STT Provider',
    description: 'Provedor de transcrição de áudio',
    isSecret: false,
    group: 'stt',
  },
  STT_SERVICE_URL: {
    key: 'STT_SERVICE_URL',
    label: 'STT Service URL',
    description: 'URL do serviço Whisper (FastAPI)',
    isSecret: false,
    group: 'stt',
  },
  WHISPER_MODEL: {
    key: 'WHISPER_MODEL',
    label: 'Whisper Model',
    description: 'Modelo faster-whisper (requer restart do PM2 whisper-stt)',
    isSecret: false,
    group: 'stt',
  },
  WHISPER_LANGUAGE: {
    key: 'WHISPER_LANGUAGE',
    label: 'Whisper Language',
    description: 'Idioma da transcrição (pt, en ou auto)',
    isSecret: false,
    group: 'stt',
  },
  CLOUDINARY_CLOUD_NAME: {
    key: 'CLOUDINARY_CLOUD_NAME',
    label: 'Cloudinary Cloud Name',
    description: 'Nome da cloud no Cloudinary',
    isSecret: false,
    group: 'cloudinary',
  },
  CLOUDINARY_API_KEY: {
    key: 'CLOUDINARY_API_KEY',
    label: 'Cloudinary API Key',
    description: 'Chave de API do Cloudinary',
    isSecret: true,
    group: 'cloudinary',
  },
  CLOUDINARY_API_SECRET: {
    key: 'CLOUDINARY_API_SECRET',
    label: 'Cloudinary API Secret',
    description: 'Segredo de API do Cloudinary',
    isSecret: true,
    group: 'cloudinary',
  },
};

export const updateSystemSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.enum(SYSTEM_SETTING_KEYS),
        value: z.string(),
      }),
    )
    .min(1),
});

export type UpdateSystemSettingsDTO = z.infer<typeof updateSystemSettingsSchema>;

export function validateSettingValue(key: SystemSettingKey, value: string): string {
  const trimmed = value.trim();

  switch (key) {
    case 'GEMINI_API_KEY':
      if (!trimmed) throw new Error('GEMINI_API_KEY não pode ser vazia');
      return trimmed;
    case 'GEMINI_MODEL':
      if (!trimmed) throw new Error('GEMINI_MODEL não pode ser vazio');
      return trimmed;
    case 'STT_PROVIDER':
      if (trimmed !== 'local') throw new Error('STT_PROVIDER deve ser "local"');
      return trimmed;
    case 'STT_SERVICE_URL':
      z.string().url().parse(trimmed);
      return trimmed;
    case 'WHISPER_MODEL':
      return whisperModelSchema.parse(trimmed);
    case 'WHISPER_LANGUAGE':
      if (!trimmed) throw new Error('WHISPER_LANGUAGE não pode ser vazio');
      return trimmed;
    case 'CLOUDINARY_CLOUD_NAME':
    case 'CLOUDINARY_API_KEY':
    case 'CLOUDINARY_API_SECRET':
      return trimmed;
    default:
      return trimmed;
  }
}

export function getEnvFallbackForKey(key: SystemSettingKey): string | undefined {
  const raw = process.env[key];
  return raw?.trim() ? raw.trim() : undefined;
}
