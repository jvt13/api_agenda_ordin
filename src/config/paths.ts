import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveBackendRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'package.json'))) {
    return cwd;
  }

  const scriptPath = process.argv[1];
  if (scriptPath) {
    let dir = path.dirname(path.resolve(scriptPath));
    for (let i = 0; i < 6; i++) {
      if (existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return cwd;
}
