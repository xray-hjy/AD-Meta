import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(frontendRoot, 'src/api/generated.ts');
const schema = path.resolve(frontendRoot, '../backend/openapi.json');
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'ad-meta-openapi-'));
const temporaryOutput = path.join(temporaryRoot, 'generated.ts');
const executable = path.join(frontendRoot, 'node_modules/.bin/openapi-typescript');

try {
  const result = spawnSync(executable, [schema, '-o', temporaryOutput], {
    cwd: frontendRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  if (!readFileSync(generated).equals(readFileSync(temporaryOutput))) {
    process.stderr.write('src/api/generated.ts is stale; run npm run openapi:types\n');
    process.exitCode = 1;
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
