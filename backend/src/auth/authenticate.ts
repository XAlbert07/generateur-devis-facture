import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from './tokens.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function readAccessToken(request: Request): string | undefined {
  const authorization = request.header('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice('Bearer '.length);
  return readCookie(request, 'access_token');
}

export function requireAuthentication(request: Request, response: Response, next: NextFunction): void {
  const token = readAccessToken(request);
  if (!token) {
    response.status(401).type('application/problem+json').json({ title: 'Authentification requise', status: 401 });
    return;
  }
  try {
    request.auth = verifyAccessToken(token);
    next();
  } catch {
    response.status(401).type('application/problem+json').json({ title: 'Session invalide ou expirée', status: 401 });
  }
}
