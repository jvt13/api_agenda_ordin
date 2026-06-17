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

  const prismaBin = resolvePrismaBin(backendRoot);
  const execCommand = prismaBin.includes(' ')
    ? `${prismaBin} generate`
    : `"${prismaBin}" generate`;

  try {
    // stdio 'pipe' (em vez de 'inherit') para que o EPERM do engine venha em error.stderr
    execSync(execCommand, {
      cwd: backendRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    });
  } catch (error) {
    const err = error as { message?: string; stderr?: Buffer | string; stdout?: Buffer | string };
    const stderr = err.stderr?.toString() ?? '';
    const stdout = err.stdout?.toString() ?? '';
    const combined = `${err.message ?? ''} ${stderr} ${stdout}`;

    if (clientExists && combined.includes('EPERM')) {
      logger.warn(
        'prisma generate ignorado — EPERM com client já existente (engine em uso). Reutilizando client gerado.',
      );
      return;
    }

    throw error;
  }
}

export function runPrismaDbPush(): void {
  runPrismaCommand('db push --skip-generate');
}
