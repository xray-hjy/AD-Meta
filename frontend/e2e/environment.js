export const e2eBackendPort = 18000;
export const e2eFrontendPort = 14173;
export const e2eDatabasePath = '/tmp/ad-meta-e2e.sqlite3';
export const e2eStorageRoot = '/tmp/ad-meta-e2e-storage';

export const e2eBackendEnvironment = {
  AD_META_DB_ENGINE: 'sqlite',
  AD_META_DB_PATH: e2eDatabasePath,
  AD_META_STORAGE_ROOT: e2eStorageRoot,
};

export const e2eApiProxyTarget = `http://127.0.0.1:${e2eBackendPort}`;
export const e2eBaseUrl = `http://127.0.0.1:${e2eFrontendPort}`;
