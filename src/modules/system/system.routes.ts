import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.js';
import { adminMiddleware } from '../../middlewares/admin.js';
import { updateSystemSettingsSchema } from '../../config/system-settings.registry.js';
import { systemSettingsService } from './system-settings.service.js';
import { getSystemHealth } from './system-health.service.js';

export async function systemRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', adminMiddleware);

  app.get('/settings', async (_request, reply) => {
    const settings = await systemSettingsService.listSettings();
    return reply.send({ settings });
  });

  app.put('/settings', async (request, reply) => {
    const body = updateSystemSettingsSchema.parse(request.body);
    const settings = await systemSettingsService.updateSettings(
      request.userId!,
      request.userEmail ?? '',
      body,
    );
    return reply.send({ settings });
  });

  app.get('/settings/audit', async (request, reply) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Number(limit) || 50, 100) : 50;
    const audit = await systemSettingsService.listAuditLogs(parsedLimit);
    return reply.send({ audit });
  });

  app.get('/health', async (_request, reply) => {
    const health = await getSystemHealth();
    return reply.send(health);
  });
}
