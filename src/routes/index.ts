import { FastifyInstance } from 'fastify';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { taskRoutes } from '../modules/tasks/task.routes.js';
import { systemRoutes } from '../modules/system/system.routes.js';

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(taskRoutes, { prefix: '/tasks' });
  await app.register(systemRoutes, { prefix: '/system' });
}
