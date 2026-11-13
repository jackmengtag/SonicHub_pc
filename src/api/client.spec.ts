import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../types/api';
import {
  BASE_KEY,
  DEFAULT_BASE,
  SESSION_KEY,
  getSession,
  normalizeBase,
  request,
  resolveMedia,
  setBase,
  setSession,
} from './client';

const oldSession = {
  access_token: 'old-access',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  tenant_id: 'tenant',
  role_name: 'user',
  permissions: [],
  user: {
    id: 'u1',
    display_name: '测试用户',
    avatar: '',
    bio: '',
    role: 'user',
    status: 'active',
    genres: [],
    created_at: '2026-01-01T00:00:00Z',
  },
} as AuthSession;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: 'OK', message: 'ok', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ code: 'UNAUTHENTICATED', message }), { status });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('API client', () => {
  it('normalizes the API base and resolves relative media URLs', () => {
    expect(normalizeBase(' 127.0.0.1:8080/ ')).toBe('http://127.0.0.1:8080');
    expect(normalizeBase('')).toBe(DEFAULT_BASE);

    setBase('http://localhost:8080/');
    expect(window.localStorage.getItem(BASE_KEY)).toBe('http://localhost:8080');
    expect(resolveMedia('/media/a.wav')).toBe('http://localhost:8080/media/a.wav');
    expect(resolveMedia('media/a.wav')).toBe('http://localhost:8080/media/a.wav');
    expect(resolveMedia('https://cdn.example.com/a.wav')).toBe('https://cdn.example.com/a.wav');
  });

  it('unwraps API data and sends the bearer token', async () => {
    setSession(oldSession);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request<{ ok: boolean }>('/api/v1/example')).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_BASE}/api/v1/example`);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer old-access');
  });

  it('shares one refresh request and retries concurrent requests once', async () => {
    setSession(oldSession);
    const nextSession = { ...oldSession, access_token: 'new-access', refresh_token: 'new-refresh' };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/refresh')) return jsonResponse(nextSession);
      if (new Headers(init?.headers).get('Authorization') === 'Bearer old-access') {
        return errorResponse(401, 'expired');
      }
      return jsonResponse({ url });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      request<{ url: string }>('/api/v1/first'),
      request<{ url: string }>('/api/v1/second'),
    ]);

    expect(first.url).toBe(`${DEFAULT_BASE}/api/v1/first`);
    expect(second.url).toBe(`${DEFAULT_BASE}/api/v1/second`);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(getSession()?.access_token).toBe('new-access');
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY) || '{}').refresh_token).toBe('new-refresh');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('clears the session and emits unauthorized when refresh fails', async () => {
    setSession(oldSession);
    const listener = vi.fn();
    window.addEventListener('sh:unauthorized', listener, { once: true });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith('/auth/refresh')
        ? errorResponse(401, 'refresh expired')
        : errorResponse(401, 'access expired')
    )));

    await expect(request('/api/v1/private')).rejects.toThrow('登录已过期，请重新登录');
    expect(getSession()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });
});
