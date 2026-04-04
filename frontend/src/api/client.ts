export interface ApiError {
  error: string;
  timestamp: number;
}

const BASE_URL_KEY = 'redis_dashboard_base_url';
const API_KEY_STORAGE_KEY = 'redis_dashboard_api_key';

/** ビルド時の環境変数フォールバック。.env に VITE_API_BASE_URL を設定すると localStorage 未設定時に使われる */
const ENV_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

export function getBaseUrl(): string {
  return localStorage.getItem(BASE_URL_KEY) ?? ENV_BASE_URL;
}

export function setBaseUrl(url: string): void {
  localStorage.setItem(BASE_URL_KEY, url.replace(/\/$/, ''));
}

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const base = getBaseUrl();
  const url = `${base}${path}`;
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`タイムアウト (${timeoutMs}ms): ${url}`);
    }
    throw new Error(`接続できません: ${url}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let errorBody: ApiError;
    try {
      errorBody = await res.json();
    } catch {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    throw new Error(errorBody.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
