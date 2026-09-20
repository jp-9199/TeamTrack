import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.resolve(__dirname, 'tests');

const testFiles = fs.readdirSync(testsDir)
  .filter(file => file.endsWith('.test.ts'))
  .map(file => path.join('tests', file));

if (testFiles.length === 0) {
  console.log('[Test Runner] No test files found.');
  process.exit(0);
}

console.log(`[Test Runner] Executing ${testFiles.length} backend test suites with tsx...`);

const child = spawn(process.execPath, [
  '--import', 'tsx',
  '--test',
  ...testFiles
], {
  cwd: __dirname,
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
