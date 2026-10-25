import type { NextFunction, Request, Response } from 'express';

function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** En-têtes de transport §15 + CORS explicite si `CORS_ORIGIN` est défini. */
export function securityHeaders(request: Request, response: Response, next: NextFunction): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const origins = allowedOrigins();
  const origin = request.header('origin');
  if (origin && origins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-Match, Idempotency-Key, X-CSRF-Token, X-Request-Id');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    response.setHeader('Access-Control-Expose-Headers', 'ETag, X-Request-Id');
  }
  if (request.method === 'OPTIONS' && origin && origins.includes(origin)) {
    response.status(204).end();
    return;
  }
  next();
}
