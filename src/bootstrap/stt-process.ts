import { execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { env } from '../config/env.js';

// backend/src/bootstrap → ../../../ → raiz do monorepo (services/stt fica na raiz).
// __dirname é global nativo (saída CommonJS via tsconfig module=NodeNext sem "type":"module").
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STT_APP_PATH = path.join(MONOREPO_ROOT, 'services', 'stt', 'app.py');
const STT_DIR = path.dirname(STT_APP_PATH);

const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_INTERVAL_MS = 2_000;
const HEALTH_MAX_ATTEMPTS = Math.floor(HEALTH_TIMEOUT_MS / HEALTH_INTERVAL_MS); // 30

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Detecção idêntica à de scripts/lib/start-stt-service.mjs */
function findPythonCommand(): string {
  const candidates = ['python', 'python3', 'py'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch {
      // tenta próximo
    }
  }
  throw new Error(
    'Python não encontrado. Instale Python 3.10+ e execute: pip install -r services/stt/requirements.txt',
  );
}

function ensureSttDeps(): void {
  const requirementsPath = path.join(STT_DIR, 'requirements.txt');
  try {
    // Checa se faster_whisper já está disponível — se sim, pula o install
    execSync(`${findPythonCommand()} -c "import faster_whisper"`, { stdio: 'ignore' });
    console.log('[STT] dependências Python já instaladas');
  } catch {
    console.log('[STT] instalando dependências Python (primeira vez ou ambiente novo)...');
    execSync(
      `${findPythonCommand()} -m pip install -r "${requirementsPath}" --quiet`,
      { stdio: 'inherit' },
    );
    console.log('[STT] dependências instaladas com sucesso');
  }
}

async function isSttHealthy(healthUrl: string): Promise<boolean> {
  try {
    const response = await fetch(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

function pipeWithPrefix(stream: NodeJS.ReadableStream | null, write: (line: string) => void): void {
  if (!stream) return;
  stream.on('data', (chunk: Buffer) => {
    const text = chunk.toString().replace(/\s+$/, '');
    if (text) write(`[STT] ${text}`);
  });
}

export async function startSttProcess(): Promise<void> {
  if (env.STT_PROVIDER !== 'local') {
    return;
  }

  const healthUrl = `${env.STT_SERVICE_URL}/health`;

  if (await isSttHealthy(healthUrl)) {
    console.log('[STT] já está rodando, pulando spawn');
    return;
  }

  // Garante que as deps Python estão instaladas antes de spawnar
  ensureSttDeps();

  const pythonCmd = findPythonCommand();
  const port = new URL(env.STT_SERVICE_URL).port || '8001';

  console.log(`[STT] iniciando Whisper local (modelo ${env.WHISPER_MODEL}) em ${STT_APP_PATH}`);

  const sttProcess: ChildProcess = spawn(
    pythonCmd,
    ['-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', port],
    {
      cwd: STT_DIR,
      detached: false,
      stdio: 'pipe',
      env: {
        ...process.env,
        WHISPER_MODEL: env.WHISPER_MODEL ?? 'small',
        WHISPER_LANGUAGE: env.WHISPER_LANGUAGE ?? 'pt',
        PORT: port,
      },
    },
  );

  pipeWithPrefix(sttProcess.stdout, (line) => console.log(line));
  pipeWithPrefix(sttProcess.stderr, (line) => console.error(line));

  sttProcess.on('exit', (code) => {
    console.log(`[STT] processo encerrado (code ${code ?? 'null'})`);
  });

  const killStt = () => sttProcess.kill();
  process.on('exit', killStt);
  process.on('SIGTERM', () => {
    killStt();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    killStt();
    process.exit(0);
  });

  for (let attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt++) {
    if (await isSttHealthy(healthUrl)) {
      console.log('[STT] saudável e pronto');
      return;
    }
    await sleep(HEALTH_INTERVAL_MS);
  }

  throw new Error('[STT] não respondeu em 60s — verifique Python e dependências');
}
