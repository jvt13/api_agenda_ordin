import { prisma } from '../../config/database.js';
import type { SystemSettingKey } from '../../config/system-settings.registry.js';

export class SystemSettingsRepository {
  async findAll() {
    return prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async findByKey(key: SystemSettingKey) {
    return prisma.systemSetting.findUnique({ where: { key } });
  }

  async upsert(key: SystemSettingKey, valueEncrypted: string, isSecret: boolean) {
    return prisma.systemSetting.upsert({
      where: { key },
      create: { key, valueEncrypted, isSecret },
      update: { valueEncrypted, isSecret },
    });
  }

  async createAudit(data: {
    settingKey: string;
    action: string;
    userId: string;
    userEmail?: string;
  }) {
    return prisma.systemSettingAudit.create({ data });
  }

  async listAudits(limit = 50) {
    return prisma.systemSettingAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const systemSettingsRepository = new SystemSettingsRepository();
