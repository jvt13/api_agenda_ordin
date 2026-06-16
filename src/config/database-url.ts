export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema: string;
}

const DEFAULT_CONFIG: DatabaseConfig = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'ordin',
  schema: 'public',
};

function hasIndividualDatabaseEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.DATABASE_HOST ||
      env.DATABASE_PORT ||
      env.DATABASE_USER ||
      env.DATABASE_PASSWORD ||
      env.DATABASE_NAME ||
      env.DATABASE_SCHEMA,
  );
}

function parseDatabaseUrl(url: string): DatabaseConfig {
  const parsed = new URL(url);
  const schema = parsed.searchParams.get('schema') ?? 'public';

  return {
    host: parsed.hostname || DEFAULT_CONFIG.host,
    port: parsed.port ? Number(parsed.port) : DEFAULT_CONFIG.port,
    user: decodeURIComponent(parsed.username || DEFAULT_CONFIG.user),
    password: decodeURIComponent(parsed.password || ''),
    database: parsed.pathname.replace(/^\//, '') || DEFAULT_CONFIG.database,
    schema,
  };
}

export function resolveDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  if (hasIndividualDatabaseEnv(env)) {
    return {
      host: env.DATABASE_HOST ?? DEFAULT_CONFIG.host,
      port: env.DATABASE_PORT ? Number(env.DATABASE_PORT) : DEFAULT_CONFIG.port,
      user: env.DATABASE_USER ?? DEFAULT_CONFIG.user,
      password: env.DATABASE_PASSWORD ?? DEFAULT_CONFIG.password,
      database: env.DATABASE_NAME ?? DEFAULT_CONFIG.database,
      schema: env.DATABASE_SCHEMA ?? DEFAULT_CONFIG.schema,
    };
  }

  if (env.DATABASE_URL?.trim()) {
    return parseDatabaseUrl(env.DATABASE_URL);
  }

  return { ...DEFAULT_CONFIG };
}

export function buildDatabaseUrl(config: DatabaseConfig, database = config.database): string {
  const user = encodeURIComponent(config.user);
  const auth = config.password
    ? `${user}:${encodeURIComponent(config.password)}`
    : user;

  return `postgresql://${auth}@${config.host}:${config.port}/${database}?schema=${config.schema}`;
}

export function applyDatabaseUrlToEnv(config: DatabaseConfig, env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = buildDatabaseUrl(config);
  env.DATABASE_URL = databaseUrl;
  return databaseUrl;
}
