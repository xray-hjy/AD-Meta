const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || DEFAULT_API_BASE_URL;

export async function fetchJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.detail || `请求失败: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
