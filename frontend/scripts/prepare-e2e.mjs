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

// Imports make revision snapshots immutable on macOS. Clear only flags on
// files inside the validated, disposable E2E root before recreating it.
if (process.platform === 'darwin') {
  const unlock = spawnSync(e2ePython, ['-c', `
import os, stat, sys
from pathlib import Path
root = Path(sys.argv[1])
if root.is_symlink():
    raise RuntimeError('Refusing a symlinked E2E root')
if root.exists():
    for path in root.rglob('*'):
        if path.is_file() and not path.is_symlink():
            flags = path.stat().st_flags
            if flags & stat.UF_IMMUTABLE:
                os.chflags(path, flags & ~stat.UF_IMMUTABLE)
`, e2eStorageRoot], { stdio: 'inherit' });
  if (unlock.error) throw unlock.error;
  if (unlock.status !== 0) throw new Error('Could not unlock disposable E2E snapshots.');
}

rmSync(e2eDatabasePath, { force: true });
rmSync(e2eStorageRoot, { force: true, recursive: true });

const manifest = createE2eManifest(path.join(e2eStorageRoot, 'fixtures'));
// The real-source heatmap fixture exercises MWU/BH and persistence. Its import
// explicitly defers the external formal-model stage; it produces no model output.
const heatmapFixtureBootstrap = `
import sys
from pathlib import Path
from unittest.mock import patch
from app.cli.bootstrap_storage import bootstrap_storage
from app.cli.import_dataset import prepare_dataframe as prepare
def heatmap_fixture(*args, **kwargs):
    frame, features, warnings = prepare(*args, **kwargs)
    frame.attrs['validation_report'] = {**frame.attrs['validation_report'],
        'inferenceEligible': False, 'formalModelValidation': 'deferred_in_isolated_heatmap_fixture'}
    return frame, features, warnings + ['Isolated heatmap fixture: external formal model stage deferred; MWU/BH is exercised by the projection API.']
with patch('app.cli.import_dataset.prepare_dataframe', side_effect=heatmap_fixture):
    bootstrap_storage(Path(sys.argv[1]))
`;
const args = process.env.AD_META_E2E_SPECIES_INPUT || process.env.AD_META_E2E_DITING_ROOT
  ? ['-c', heatmapFixtureBootstrap, manifest]
  : ['-m', 'app.cli.bootstrap_storage', '--manifest', manifest];
const result = spawnSync(e2ePython, args, {
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
