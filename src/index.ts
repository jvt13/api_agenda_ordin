import './config/env.js';
import { bootstrapDatabase } from './bootstrap/database/index.js';
import { startSttProcess } from './bootstrap/stt-process.js';
import { prisma } from './config/database.js';
import { env } from './config/env.js';
import { initializeGeminiProvider } from './providers/gemini.provider.js';
import { logSttStartupStatus } from './providers/stt.provider.js';
import { initializeSystemSettings } from './modules/system/system-settings.service.js';
import { startServer, stopServer } from './server.js';
import { logger } from './utils/logger.js';
import { voiceLog } from './utils/voice-logger.js';

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Recebido ${signal}, encerrando API...`);

  try {
    await stopServer();
    await prisma.$disconnect();
    logger.info('✅ API encerrada com sucesso');
    process.exit(0);
  } catch (error) {
    logger.error('Erro ao encerrar API', {
      message: (error as Error).message,
    });
    process.exit(1);
  }
}

async function main() {
  logger.info('Iniciando Ordin Flow API...', { port: env.PORT, nodeEnv: env.NODE_ENV });

  await bootstrapDatabase();

  await initializeSystemSettings();

  try {
    const geminiModel = await initializeGeminiProvider();
    voiceLog.gemini('Provider Gemini pronto', { model: geminiModel });
  } catch (error) {
    logger.warn('[GEMINI] Provider não inicializado — configure via painel admin ou .env', {
      message: (error as Error).message,
    });
  }

  await startSttProcess();

  await logSttStartupStatus();

  await startServer();

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: Error) => {
  logger.error('❌ Falha na inicialização do backend', {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
