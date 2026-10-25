import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestIdOf(request: Request): string {
  return request.res?.locals.requestId ?? 'unknown';
}

export function logInfo(message: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: 'info', at: new Date().toISOString(), message, ...fields }));
}

export function logError(message: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message, ...fields }));
}

/** Identifiant de corrélation + journal d’accès JSON (sans corps ni secrets). */
export function requestLogging(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id')?.trim();
  const requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  const started = Date.now();
  response.on('finish', () => {
    logInfo('http_request', {
      requestId,
      method: request.method,
      path: request.originalUrl.split('?')[0],
      status: response.statusCode,
      durationMs: Date.now() - started,
    });
  });
  next();
}
