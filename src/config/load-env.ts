import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { applyDatabaseUrlToEnv, resolveDatabaseConfig } from './database-url.js';
import { resolveBackendRoot } from './paths.js';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;

  const backendRoot = resolveBackendRoot();
  const candidates = [
    path.join(backendRoot, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'backend', '.env'),
    path.join(process.cwd(), '../backend', '.env'),
  ];

  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    dotenv.config();
    loaded = true;
  }

  applyDatabaseUrlToEnv(resolveDatabaseConfig());
}
