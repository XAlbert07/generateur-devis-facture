import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { problem } from '../http/problem.js';
import { readCookie } from './cookies.js';
import { verifyAccessToken, type AccessTokenPayload } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}

function readAccessToken(request: Request): string | undefined {
  const authorization = request.header('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice('Bearer '.length);
  return readCookie(request, 'access_token');
}

function isPasswordChangeAllowed(request: Request): boolean {
  const url = (request.originalUrl.split('?')[0] ?? '');
  return url.endsWith('/auth/change-password')
    || url.endsWith('/auth/logout')
    || url.endsWith('/auth/me');
}

export function requireAuthentication(request: Request, response: Response, next: NextFunction): void {
  const token = readAccessToken(request);
  if (!token) {
    problem(response, 401, 'Authentification requise');
    return;
  }
  try {
    request.auth = verifyAccessToken(token);
  } catch {
    problem(response, 401, 'Session invalide ou expirée');
    return;
  }
  void enforceMustChangePassword(request, response, next);
}

async function enforceMustChangePassword(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: { mustChangePassword: true },
    });
    if (!user) {
      problem(response, 401, 'Session invalide');
      return;
    }
    if (user.mustChangePassword && !isPasswordChangeAllowed(request)) {
      problem(response, 403, 'Changement de mot de passe obligatoire');
      return;
    }
    next();
  } catch {
    problem(response, 500, 'Erreur interne du serveur');
  }
}
