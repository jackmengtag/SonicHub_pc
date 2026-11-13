import type { AuthSession, Health, OkResult } from '../types/api';

export const BASE_KEY = 'sh_api';
export const SESSION_KEY = 'sh_auth';
export const DEFAULT_BASE = 'http://119.91.65.225:8080';
const LEGACY_DEFAULT_BASES = new Set(['http://127.0.0.1:8080', 'http://127.0.0.1:8081']);

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RequestOptions {
  method?: RequestMethod;
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
  signal?: AbortSignal;
}

interface ApiPayload {
  code?: string;
  message?: string;
  data?: unknown;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeBase(value?: string | null): string {
  let normalized = String(value || '').trim();
  if (!normalized) normalized = DEFAULT_BASE;
  if (!/^https?:\/\//i.test(normalized)) normalized = `http://${normalized}`;
  return normalized.replace(/\/+$/, '');
}

export function getBase(): string {
  const stored = storage()?.getItem(BASE_KEY);
  const value = stored ? normalizeBase(stored) : '';
  if (value && LEGACY_DEFAULT_BASES.has(value)) {
    setBase(DEFAULT_BASE);
    return DEFAULT_BASE;
  }
  return value || DEFAULT_BASE;
}

export const base = getBase;

export function setBase(value?: string | null): string {
  const normalized = normalizeBase(value);
  storage()?.setItem(BASE_KEY, normalized);
  return normalized;
}

export function getSession(): AuthSession | null {
  const raw = storage()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? value as AuthSession : null;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession | null): void {
  if (!session) {
    clearSession();
    return;
  }
  storage()?.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  storage()?.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message = '请求失败', code = 'UNKNOWN', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function readPayload(response: Response): Promise<ApiPayload | null> {
  try {
    return await response.json() as ApiPayload;
  } catch {
    return null;
  }
}

function networkError(): ApiError {
  return new ApiError(`无法连接 API 服务器（${getBase()}）`, 'NETWORK_ERROR', 0);
}

let refreshing: Promise<AuthSession> | null = null;

export async function refreshToken(): Promise<AuthSession> {
  if (refreshing) return refreshing;
  const session = getSession();
  if (!session?.refresh_token) {
    throw new ApiError('登录状态已失效', 'UNAUTHENTICATED', 401);
  }

  refreshing = (async () => {
    let response: Response;
    try {
      response = await fetch(`${getBase()}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
    } catch {
      throw networkError();
    }

    const payload = await readPayload(response);
    if (!response.ok || payload?.code !== 'OK') {
      throw new ApiError(payload?.message || '登录已过期', 'UNAUTHENTICATED', response.status);
    }
    const next = { ...session, ...payload.data as AuthSession };
    setSession(next);
    return next;
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

function expireSession(): void {
  clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sh:unauthorized'));
  }
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const auth = options.auth !== false;
  const retry = options.retry !== false;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const session = getSession();
  if (auth && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  let response: Response;
  try {
    response = await fetch(getBase() + path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw networkError();
  }

  const payload = await readPayload(response);

  if (response.status === 401 && auth) {
    if (retry && session?.refresh_token) {
      try {
        await refreshToken();
      } catch {
        expireSession();
        throw new ApiError('登录已过期，请重新登录', 'UNAUTHENTICATED', 401);
      }
      return request<T>(path, { ...options, retry: false });
    }

    const message = payload?.message || (retry ? '登录已过期，请重新登录' : '请先登录');
    expireSession();
    throw new ApiError(message, payload?.code || 'UNAUTHENTICATED', 401);
  }

  if (!response.ok || payload?.code !== 'OK') {
    const message = payload?.message || `请求失败（${response.status}）`;
    throw new ApiError(message, payload?.code || `HTTP_${response.status}`, response.status);
  }
  return payload.data as T;
}

export async function login(phone: string, code: string): Promise<AuthSession> {
  const data = await request<AuthSession>('/api/v1/auth/login', {
    method: 'POST',
    body: { phone, code },
    auth: false,
  });
  setSession(data);
  return data;
}

export async function logout(): Promise<void> {
  const session = getSession();
  try {
    if (session?.refresh_token) {
      await request<OkResult>('/api/v1/auth/logout', {
        method: 'POST',
        body: { refresh_token: session.refresh_token },
        retry: false,
      });
    }
  } catch {
    // 本地退出不依赖后端通知成功。
  } finally {
    clearSession();
  }
}

export function health(): Promise<Health> {
  return request<Health>('/health', { auth: false });
}

export function resolveMedia(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return getBase() + (url.startsWith('/') ? '' : '/') + url;
}
