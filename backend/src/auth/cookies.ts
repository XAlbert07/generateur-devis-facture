import type { Request, Response } from 'express';

const isProduction = () => process.env.NODE_ENV === 'production';

export function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  const prefix = `${name}=`;
  const part = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : undefined;
}

export function setAccessCookie(response: Response, token: string): void {
  response.cookie('access_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: 15 * 60 * 1000,
    path: '/api/v1',
  });
}

export function setRefreshCookie(response: Response, token: string): void {
  response.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });
}

/** Cookie lisible par le navigateur pour la double soumission CSRF. */
export function setCsrfCookie(response: Response, token: string): void {
  response.cookie('csrf_token', token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie('access_token', { httpOnly: true, sameSite: 'lax', path: '/api/v1' });
  response.clearCookie('refresh_token', { httpOnly: true, sameSite: 'lax', path: '/api/v1/auth' });
  response.clearCookie('csrf_token', { sameSite: 'lax', path: '/' });
}

export function clientIp(request: Request): string {
  const forwarded = request.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.socket.remoteAddress || '0.0.0.0';
}
