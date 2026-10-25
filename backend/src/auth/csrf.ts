import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { problem } from '../http/problem.js';
import { readCookie } from './cookies.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function newCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}

const CSRF_EXEMPT = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
];

/**
 * Double soumission : cookie `csrf_token` (lisible JS) + en-tête `X-CSRF-Token`.
 * Les clients Bearer (tests, API) sont exemptés ; login/register aussi (pas encore de cookie).
 */
export function requireCsrf(request: Request, response: Response, next: NextFunction): void {
  if (SAFE.has(request.method)) return next();
  if (request.header('authorization')?.startsWith('Bearer ')) return next();
  const path = request.originalUrl.split('?')[0] ?? '';
  if (CSRF_EXEMPT.some((exempt) => path === exempt || path.endsWith(exempt))) return next();

  const cookie = readCookie(request, 'csrf_token');
  const header = request.header('x-csrf-token');
  if (!cookie || !header || cookie !== header) {
    problem(response, 403, 'Jeton CSRF manquant ou invalide');
    return;
  }
  next();
}
