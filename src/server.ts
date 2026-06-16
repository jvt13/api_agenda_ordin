import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { logger } from './utils/logger.js';

let app: FastifyInstance | null = null;

export async function startServer(): Promise<FastifyInstance> {
  app = Fastify({
    logger: false,
    bodyLimit: 15 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  app.setErrorHandler(errorHandler);

  app.get('/uploads/*', async (request, reply) => {
    const wildcard = (request.params as { '*': string })['*'];
    const safeRelative = path.normalize(wildcard).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.resolve(process.cwd(), 'uploads', safeRelative);

    try {
      const file = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeByExt: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.m4a': 'audio/mp4',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
      };
      const mime = mimeByExt[ext] ?? 'application/octet-stream';
      return reply.header('Content-Type', mime).send(file);
    } catch {
      return reply.status(404).send({ error: 'FileNotFound', message: 'Arquivo não encontrado' });
    }
  });

  await registerRoutes(app);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (error) {
    const message = (error as NodeJS.ErrnoException).message ?? String(error);
    if (message.includes('EADDRINUSE')) {
      logger.error(`❌ Porta ${env.PORT} já está em uso. Altere PORT no .env ou encerre o processo conflitante.`);
    }
    throw error;
  }

  logger.info(`✅ API iniciada na porta ${env.PORT} (http://0.0.0.0:${env.PORT})`);
  logger.info(`   Ambiente: ${env.NODE_ENV}`);

  return app;
}

export async function stopServer(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}
