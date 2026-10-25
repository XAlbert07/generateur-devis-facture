import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function issueRefreshToken(userId: string, familyId: string = randomUUID()): Promise<{ raw: string; id: string; familyId: string }> {
  const raw = newRawToken();
  const created = await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { raw, id: created.id, familyId };
}

export async function revokeUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeRefreshFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export type RotateResult =
  | { kind: 'ok'; raw: string; userId: string }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'reuse' };

/** Rotation : un jeton déjà consommé révoque toute la lignée (§15). */
export async function rotateRefreshToken(raw: string): Promise<RotateResult> {
  const current = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(raw) } });
  if (!current) return { kind: 'invalid' };
  if (current.revokedAt) {
    await revokeRefreshFamily(current.familyId);
    return { kind: 'reuse' };
  }
  if (current.expiresAt.getTime() <= Date.now()) {
    await prisma.refreshToken.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
    return { kind: 'expired' };
  }
  const next = await issueRefreshToken(current.userId, current.familyId);
  await prisma.refreshToken.update({
    where: { id: current.id },
    data: { revokedAt: new Date(), replacedById: next.id },
  });
  return { kind: 'ok', raw: next.raw, userId: current.userId };
}

export async function revokeRawRefreshToken(raw: string | undefined): Promise<void> {
  if (!raw) return;
  const current = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(raw) } });
  if (!current || current.revokedAt) return;
  await prisma.refreshToken.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
}
