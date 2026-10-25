export type Problem = { title?: string; status?: number; errors?: unknown };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

function readBrowserCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  const part = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : undefined;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json, application/problem+json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const method = (options.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readBrowserCookie('csrf_token');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as Problem | null;
  if (!response.ok) {
    throw new ApiError(body?.title ?? 'La requête a échoué.', response.status, body?.errors);
  }
  return body as T;
}
