/** Base URL for the Panel1 API (Express + Hono module routes). */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
}

export function getAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (extra && typeof extra === 'object' && !(extra instanceof Headers)) {
    Object.assign(headers, extra as Record<string, string>);
  }
  return headers;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers && typeof init.headers === 'object' && !(init.headers instanceof Headers)
        ? (init.headers as Record<string, string>)
        : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      message = j.message || j.error || text;
    } catch {
      /* ignore */
    }
    throw new Error(message || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
