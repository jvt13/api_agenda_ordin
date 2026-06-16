import {
  applyDatabaseUrlToEnv,
  resolveDatabaseConfig,
} from '../../config/database-url.js';
import { logger } from '../../utils/logger.js';
import {
  createDatabaseIfNotExists,
  testApplicationDatabase,
  waitForPostgres,
} from './connection.js';
import { runPrismaDbPush, runPrismaGenerate } from './prisma-sync.js';
import { validateDatabaseSchema } from './validate-schema.js';

export async function bootstrapDatabase(): Promise<void> {
  const config = resolveDatabaseConfig();
  const databaseUrl = applyDatabaseUrlToEnv(config);

  logger.info('Bootstrap do banco de dados iniciado', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  });

  logger.info('Validando conexão com PostgreSQL...');
  await waitForPostgres(config);
  logger.info('✅ PostgreSQL acessível', {
    host: config.host,
    port: config.port,
  });

  logger.info(`Verificando banco "${config.database}"...`);
  const created = await createDatabaseIfNotExists(config);
  if (created) {
    logger.info(`✅ Banco "${config.database}" criado`);
  } else {
    logger.info(`✅ Banco "${config.database}" já existe`);
  }

  await testApplicationDatabase(config);
  logger.info(`✅ Banco conectado: ${config.database}`);

  logger.info('Executando prisma generate...');
  runPrismaGenerate();
  logger.info('✅ Prisma Client gerado');

  logger.info('Executando prisma db push...');
  runPrismaDbPush();
  logger.info('✅ Schema Prisma sincronizado');

  const tables = await validateDatabaseSchema(config);
  logger.info('✅ Tabelas validadas', { tables: tables.join(', ') });

  logger.info('Bootstrap do banco concluído', {
    databaseUrl: databaseUrl.replace(config.password, '****'),
  });
}
