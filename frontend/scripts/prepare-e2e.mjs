import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createE2eManifest } from '../e2e/fixtures.js';

import {
  e2eBackendEnvironment,
  e2eDatabasePath,
  e2eStorageRoot,
  e2eTemporaryRoot,
  e2ePython,
} from '../e2e/environment.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.resolve(frontendRoot, '../backend');

for (const target of [e2eDatabasePath, e2eStorageRoot]) {
  if (path.dirname(path.resolve(target)) !== path.resolve(e2eTemporaryRoot)) {
    throw new Error(`Refusing to clean an E2E target outside the system temporary directory: ${target}`);
  }
}

rmSync(e2eDatabasePath, { force: true });
rmSync(e2eStorageRoot, { force: true, recursive: true });

const manifest = createE2eManifest(path.join(e2eStorageRoot, 'fixtures'));
const result = spawnSync(e2ePython, ['-m', 'app.cli.bootstrap_storage', '--manifest', manifest], {
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
