import { Client } from 'pg';
import type { DatabaseConfig } from '../../config/database-url.js';
import { buildDatabaseUrl } from '../../config/database-url.js';

const REQUIRED_TABLES = ['users', 'refresh_tokens', 'tasks', 'task_activities'] as const;

export async function validateDatabaseSchema(config: DatabaseConfig): Promise<string[]> {
  const client = new Client({
    connectionString: buildDatabaseUrl(config),
  });

  await client.connect();

  try {
    const result = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_type = 'BASE TABLE'`,
      [config.schema],
    );

    const existing = new Set(result.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !existing.has(table));

    if (missing.length > 0) {
      throw new Error(`Tabelas ausentes no schema "${config.schema}": ${missing.join(', ')}`);
    }

    return [...REQUIRED_TABLES];
  } finally {
    await client.end();
  }
}
