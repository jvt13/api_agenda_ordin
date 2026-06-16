import { FastifyInstance } from 'fastify';
import { authService } from './auth.service.js';
import { loginSchema, refreshTokenSchema, registerSchema } from './auth.dto.js';
import { authMiddleware } from '../../middlewares/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await authService.register(body);
    return reply.status(201).send(result);
  });

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await authService.login(body);
    return reply.send(result);
  });

  app.post('/refresh', async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const result = await authService.refresh(body.refreshToken);
    return reply.send(result);
  });

  app.post('/logout', async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    await authService.logout(body.refreshToken);
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: authMiddleware }, async (request, reply) => {
    const profile = await authService.getProfile(request.userId!);
    return reply.send(profile);
  });
}
