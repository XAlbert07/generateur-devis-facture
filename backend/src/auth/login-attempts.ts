import { prisma } from '../db/prisma.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function isLoginBlocked(email: string, ip: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { lockedUntil: true } });
  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) return true;

  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, succeeded: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, succeeded: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_FAILURES || byIp >= MAX_FAILURES;
}

export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, ip, succeeded: false } });
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: { email, succeeded: false, createdAt: { gte: since } },
  });
  if (failures >= MAX_FAILURES) {
    await prisma.user.updateMany({
      where: { email },
      data: { lockedUntil: new Date(Date.now() + WINDOW_MS) },
    });
  }
}

export async function recordLoginSuccess(email: string, ip: string, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.loginAttempt.create({ data: { email, ip, succeeded: true } }),
    prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lockedUntil: null },
    }),
  ]);
}
