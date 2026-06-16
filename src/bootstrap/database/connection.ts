import { Client } from 'pg';
import type { DatabaseConfig } from '../../config/database-url.js';
import { buildDatabaseUrl } from '../../config/database-url.js';
import { formatPostgresError } from '../../utils/postgres-errors.js';
import { logger } from '../../utils/logger.js';

const ADMIN_DATABASE = 'postgres';

function createClient(config: DatabaseConfig, database: string): Client {
  return new Client({
    connectionString: buildDatabaseUrl(config, database),
    connectionTimeoutMillis: 5000,
  });
}

function wrapPostgresError(error: unknown, config: DatabaseConfig): Error {
  const formatted = formatPostgresError(error, config);
  logger.error(formatted);
  return new Error(formatted);
}

export async function testPostgresConnection(config: DatabaseConfig): Promise<void> {
  const client = createClient(config, ADMIN_DATABASE);
  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch (error) {
    throw wrapPostgresError(error, config);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function waitForPostgres(
  config: DatabaseConfig,
  maxAttempts = 15,
  delayMs = 2000,
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await testPostgresConnection(config);
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        logger.warn(`Tentativa ${attempt}/${maxAttempts} — PostgreSQL indisponível, aguardando...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new Error(formatPostgresError(new Error('Conexão falhou'), config));
}

export async function databaseExists(config: DatabaseConfig): Promise<boolean> {
  const client = createClient(config, ADMIN_DATABASE);
  try {
    await client.connect();
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [config.database],
    );
    return result.rows[0]?.exists ?? false;
  } catch (error) {
    throw wrapPostgresError(error, config);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function createDatabaseIfNotExists(config: DatabaseConfig): Promise<boolean> {
  const exists = await databaseExists(config);
  if (exists) return false;

  const client = createClient(config, ADMIN_DATABASE);
  try {
    await client.connect();
    const safeName = config.database.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${safeName}"`);
    return true;
  } catch (error) {
    throw wrapPostgresError(error, config);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function testApplicationDatabase(config: DatabaseConfig): Promise<void> {
  const client = createClient(config, config.database);
  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch (error) {
    throw wrapPostgresError(error, config);
  } finally {
    await client.end().catch(() => undefined);
  }
}
