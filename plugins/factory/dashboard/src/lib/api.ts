import type { FactoryState, TaskDetail } from './types';

const TOKEN_KEY = 'factory.token';

export class AuthError extends Error {}

// The access token arrives as ?t=… (from the CLI or the QR code). Keep it in storage and
// drop it from the address bar so it isn't shoulder-surfed or shared by accident.
export function readToken(): string | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('t');
  if (fromUrl) {
    try {
      localStorage.setItem(TOKEN_KEY, fromUrl);
    } catch {
      // Private mode: the token still works for this page load.
    }
    url.searchParams.delete('t');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return fromUrl;
  }
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function get<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store' });
  if (res.status === 401) throw new AuthError('Invalid or missing access token.');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const fetchState = (token: string, signal?: AbortSignal) => get<FactoryState>('api/state', token, signal);
export const fetchTask = (token: string, id: string, signal?: AbortSignal) => get<TaskDetail>(`api/tasks/${encodeURIComponent(id)}`, token, signal);
export const eventsUrl = (token: string) => `api/events?t=${encodeURIComponent(token)}`;
