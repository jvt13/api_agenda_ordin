import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveBackendRoot } from '../../config/paths.js';
import { logger } from '../../utils/logger.js';

function resolvePrismaBin(backendRoot: string): string {
  const binName = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
  const localBin = path.join(backendRoot, 'node_modules', '.bin', binName);

  if (existsSync(localBin)) {
    return localBin;
  }

  return 'npx prisma';
}

function runPrismaCommand(command: string): void {
  const backendRoot = resolveBackendRoot();
  const prismaBin = resolvePrismaBin(backendRoot);
  const execCommand = prismaBin.includes(' ')
    ? `${prismaBin} ${command}`
    : `"${prismaBin}" ${command}`;

  execSync(execCommand, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });
}

export function runPrismaGenerate(): void {
  const backendRoot = resolveBackendRoot();
  const prismaClientDir = path.join(backendRoot, 'node_modules', '.prisma', 'client');
  const clientExists = existsSync(path.join(prismaClientDir, 'index.js'));

  try {
    runPrismaCommand('generate');
  } catch (error) {
    const message = (error as Error).message ?? '';

    if (clientExists && message.includes('EPERM')) {
      logger.warn(
        'prisma generate ignorado — client já existe (arquivo em uso). Reinicie o processo.',
      );
      return;
    }

    throw error;
  }
}

export function runPrismaDbPush(): void {
  runPrismaCommand('db push --skip-generate');
}
