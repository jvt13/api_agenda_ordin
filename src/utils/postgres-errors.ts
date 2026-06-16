import type { DatabaseConfig } from '../config/database-url.js';

interface PgErrorLike {
  code?: string;
  message?: string;
}

export function formatPostgresError(error: unknown, config: DatabaseConfig): string {
  const pgError = error as PgErrorLike;
  const message = pgError.message ?? (error instanceof Error ? error.message : String(error));
  const code = pgError.code ?? '';

  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return [
      '❌ Falha ao conectar ao PostgreSQL: conexão recusada.',
      `   Host: ${config.host}:${config.port}`,
      '   Verifique se o PostgreSQL está rodando e se DATABASE_HOST/DATABASE_PORT estão corretos.',
    ].join('\n');
  }

  if (code === '28P01' || message.includes('password authentication failed')) {
    return [
      '❌ Falha ao conectar ao PostgreSQL: autenticação recusada.',
      `   Usuário: ${config.user}`,
      '   Verifique DATABASE_USER e DATABASE_PASSWORD no .env.',
    ].join('\n');
  }

  if (message.includes('database') && message.includes('does not exist')) {
    return [
      '❌ Falha ao conectar ao PostgreSQL: banco de dados não existe.',
      `   Banco: ${config.database}`,
      '   Verifique DATABASE_NAME ou crie o banco manualmente.',
    ].join('\n');
  }

  if (code === 'ENOTFOUND' || message.includes('getaddrinfo ENOTFOUND')) {
    return [
      '❌ Falha ao conectar ao PostgreSQL: host não encontrado.',
      `   Host: ${config.host}`,
      '   Verifique DATABASE_HOST no .env.',
    ].join('\n');
  }

  if (code === 'ETIMEDOUT' || message.includes('timeout')) {
    return [
      '❌ Falha ao conectar ao PostgreSQL: tempo esgotado.',
      `   Host: ${config.host}:${config.port}`,
      '   Verifique firewall, rede e se o PostgreSQL aceita conexões remotas.',
    ].join('\n');
  }

  return [
    '❌ Falha ao conectar ao PostgreSQL.',
    `   Host: ${config.host}:${config.port} | Banco: ${config.database} | Usuário: ${config.user}`,
    `   Detalhe: ${message}`,
  ].join('\n');
}
