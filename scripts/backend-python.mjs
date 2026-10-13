import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backend = fileURLToPath(new URL('../backend/', import.meta.url));
const python = path.join(backend, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python)) {
  console.error('Backend virtual environment is missing. See docs/guides/runbook.md.');
  process.exit(1);
}
const child = spawn(python, process.argv.slice(2), { cwd: backend, stdio: 'inherit' });
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
