import { AppError } from '../../middlewares/errorHandler.js';
import { applyRuntimeSettings, getAppConfig } from '../../config/runtime-config.js';
import {
  getEnvFallbackForKey,
  SYSTEM_SETTING_DEFINITIONS,
  SYSTEM_SETTING_KEYS,
  type SystemSettingKey,
  validateSettingValue,
  type UpdateSystemSettingsDTO,
} from '../../config/system-settings.registry.js';
import { decryptValue, encryptValue, maskSecret } from '../../utils/encryption.js';
import { logger } from '../../utils/logger.js';
import { reconfigureCloudinary } from '../../providers/storage.provider.js';
import { reinitializeGeminiProvider } from '../../providers/gemini.provider.js';
import { systemSettingsRepository } from './system-settings.repository.js';

export interface SystemSettingView {
  key: SystemSettingKey;
  label: string;
  description: string;
  group: 'gemini' | 'stt' | 'cloudinary';
  isSecret: boolean;
  value: string;
  maskedValue: string;
  configured: boolean;
  source: 'database' | 'env' | 'default';
}

function readDecryptedValue(valueEncrypted: string): string {
  return decryptValue(valueEncrypted);
}

export async function loadRuntimeConfigFromDatabase(): Promise<Record<SystemSettingKey, string>> {
  const rows = await systemSettingsRepository.findAll();
  const values = {} as Record<SystemSettingKey, string>;

  for (const row of rows) {
    values[row.key as SystemSettingKey] = readDecryptedValue(row.valueEncrypted);
  }

  return values;
}

export async function initializeSystemSettings(): Promise<void> {
  const existing = await systemSettingsRepository.findAll();
  const existingKeys = new Set(existing.map((row) => row.key));

  for (const key of SYSTEM_SETTING_KEYS) {
    if (existingKeys.has(key)) continue;

    const fallback = getEnvFallbackForKey(key);
    if (!fallback) continue;

    const definition = SYSTEM_SETTING_DEFINITIONS[key];
    const validated = validateSettingValue(key, fallback);

    await systemSettingsRepository.upsert(
      key,
      encryptValue(validated),
      definition.isSecret,
    );

    logger.info('[SETTINGS] Configuração migrada do .env para o banco', { key });
  }

  const dbValues = await loadRuntimeConfigFromDatabase();
  if (Object.keys(dbValues).length > 0) {
    applyRuntimeSettings(dbValues);
    logger.info('[SETTINGS] Configurações carregadas do banco', {
      keys: Object.keys(dbValues),
    });
  } else {
    applyRuntimeSettings({});
    logger.warn(
      '[SETTINGS] Nenhuma configuração no banco — usando .env ou padrões. Configure via painel admin.',
    );
  }
}

export class SystemSettingsService {
  async listSettings(): Promise<SystemSettingView[]> {
    const rows = await systemSettingsRepository.findAll();
    const rowMap = new Map(rows.map((row) => [row.key, row]));
    const config = getAppConfig();

    return SYSTEM_SETTING_KEYS.map((key) => {
      const definition = SYSTEM_SETTING_DEFINITIONS[key];
      const row = rowMap.get(key);
      let value = '';
      let source: SystemSettingView['source'] = 'default';

      if (row) {
        value = readDecryptedValue(row.valueEncrypted);
        source = 'database';
      } else {
        const envFallback = getEnvFallbackForKey(key);
        if (envFallback) {
          value = envFallback;
          source = 'env';
        } else {
          value = String(config[key as keyof typeof config] ?? '');
          source = 'default';
        }
      }

      return {
        key,
        label: definition.label,
        description: definition.description,
        group: definition.group,
        isSecret: definition.isSecret,
        value: definition.isSecret ? maskSecret(value) : value,
        maskedValue: definition.isSecret ? maskSecret(value) : value,
        configured: Boolean(value),
        source,
      };
    });
  }

  async updateSettings(userId: string, userEmail: string, data: UpdateSystemSettingsDTO) {
    const updates: Partial<Record<SystemSettingKey, string>> = {};

    for (const item of data.settings) {
      const definition = SYSTEM_SETTING_DEFINITIONS[item.key];
      let validated: string;

      try {
        validated = validateSettingValue(item.key, item.value);
      } catch (error) {
        throw new AppError(400, (error as Error).message, 'ValidationError');
      }

      const current = await systemSettingsRepository.findByKey(item.key);
      if (current) {
        const previous = readDecryptedValue(current.valueEncrypted);
        if (definition.isSecret && item.value.includes('*') && previous) {
          updates[item.key] = previous;
          continue;
        }
      }

      await systemSettingsRepository.upsert(
        item.key,
        encryptValue(validated),
        definition.isSecret,
      );

      await systemSettingsRepository.createAudit({
        settingKey: item.key,
        action: 'UPDATE',
        userId,
        userEmail,
      });

      updates[item.key] = validated;
    }

    applyRuntimeSettings(updates);

    if (
      updates.GEMINI_API_KEY !== undefined ||
      updates.GEMINI_MODEL !== undefined
    ) {
      await reinitializeGeminiProvider().catch((error: Error) => {
        logger.warn('[SETTINGS] Gemini não reinicializado após atualização', {
          message: error.message,
        });
      });
    }

    if (
      updates.CLOUDINARY_CLOUD_NAME !== undefined ||
      updates.CLOUDINARY_API_KEY !== undefined ||
      updates.CLOUDINARY_API_SECRET !== undefined
    ) {
      reconfigureCloudinary();
    }

    logger.info('[SETTINGS] Configurações atualizadas via painel admin', {
      userId,
      keys: Object.keys(updates),
    });

    return this.listSettings();
  }

  async listAuditLogs(limit = 50) {
    return systemSettingsRepository.listAudits(limit);
  }
}

export const systemSettingsService = new SystemSettingsService();
