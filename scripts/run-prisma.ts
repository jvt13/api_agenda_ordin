import '../src/config/load-env.js';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2).join(' ');

if (!args) {
  console.error('Uso: tsx scripts/run-prisma.ts <comando prisma>');
  process.exit(1);
}

execSync(`npx prisma ${args}`, {
  stdio: 'inherit',
  env: process.env,
});
