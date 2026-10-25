import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logError } from '../http/logger.js';

export type AuditAction =
  | 'auth.login'
  | 'auth.register'
  | 'quote.send'
  | 'quote.convert'
  | 'invoice.issue'
  | 'invoice.cancel'
  | 'payment.create'
  | 'payment.cancel'
  | 'company.update';

/** Écrit un événement d’audit ; n’échoue jamais la requête métier. */
export async function recordAudit(
  request: Request | null,
  input: {
    action: AuditAction;
    companyId?: string | null;
    userId?: string | null;
    resource?: string;
    resourceId?: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  try {
    const data: Prisma.AuditEventUncheckedCreateInput = {
      action: input.action,
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      resource: input.resource ?? null,
      resourceId: input.resourceId ?? null,
      requestId: request?.res?.locals.requestId ?? null,
    };
    if (input.metadata) data.metadata = input.metadata;
    await prisma.auditEvent.create({ data });
  } catch (error) {
    logError('audit_write_failed', {
      action: input.action,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}
