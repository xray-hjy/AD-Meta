import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'dist/index.html');
if (!existsSync(entry)) {
  console.error('Build output is missing. Run .\\Start-ADMeta.ps1 build or npm run build first.');
  process.exit(1);
}

function latestModification(target) {
  if (!existsSync(target)) return 0;
  const info = statSync(target);
  if (!info.isDirectory()) return info.mtimeMs;
  return readdirSync(target, { withFileTypes: true })
    .filter(item => !item.isSymbolicLink())
    .reduce((latest, item) => Math.max(latest, latestModification(path.join(target, item.name))), info.mtimeMs);
}

const inputs = ['src', 'public', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json'];
if (inputs.some(input => latestModification(path.join(root, input)) > statSync(entry).mtimeMs)) {
  console.warn('Source files are newer than this build. Run npm run build to preview the latest changes.');
}
console.log(`Previewing build from ${new Date(statSync(entry).mtimeMs).toLocaleString()}`);
const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit',
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
