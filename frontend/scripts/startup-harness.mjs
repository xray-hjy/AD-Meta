import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createServer, preview } from 'vite';

export const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const cacheParent = path.join(frontendRoot, 'node_modules');

export function createStartupCache() {
  return mkdtemp(path.join(cacheParent, '.vite-startup-'));
}

export async function removeStartupCache(cacheDir) {
  if (path.dirname(cacheDir) !== cacheParent || !path.basename(cacheDir).startsWith('.vite-startup-')) {
    throw new Error('Unexpected startup cache cleanup path');
  }
  await rm(cacheDir, { recursive: true, force: true });
}

export async function withStartupServer(cacheDir, action) {
  const started = performance.now();
  const server = await createServer({
    root: frontendRoot,
    cacheDir,
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    logLevel: 'silent',
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    return await action(server, `http://127.0.0.1:${address.port}`, Math.round(performance.now() - started));
  } finally {
    await server.close();
  }
}

export function runtimeWatchDirectories(server) {
  return Object.keys(server.watcher.getWatched()).filter(directory => directory.replaceAll('\\', '/').includes('/.tmp/'));
}

export async function withStartupPreview(action) {
  const server = await preview({ root: frontendRoot, preview: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'silent' });
  try {
    const address = server.httpServer.address();
    return await action(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
}
