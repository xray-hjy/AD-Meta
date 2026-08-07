import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  e2eBackendEnvironment,
  e2eDatabasePath,
  e2eStorageRoot,
} from '../e2e/environment.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.resolve(frontendRoot, '../backend');
const python = process.env.CI ? 'python' : '.venv/bin/python';

for (const target of [e2eDatabasePath, e2eStorageRoot]) {
  if (path.dirname(target) !== '/tmp') {
    throw new Error(`Refusing to clean an E2E target outside /tmp: ${target}`);
  }
}

rmSync(e2eDatabasePath, { force: true });
rmSync(e2eStorageRoot, { force: true, recursive: true });

const result = spawnSync(python, ['-m', 'app.cli.bootstrap_storage'], {
  cwd: backendRoot,
  env: {
    ...process.env,
    ...e2eBackendEnvironment,
  },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
