import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAuthentication } from './authenticate.js';
import { clearAuthCookies, clientIp, readCookie, setAccessCookie, setCsrfCookie, setRefreshCookie } from './cookies.js';
import { newCsrfToken } from './csrf.js';
import { isLoginBlocked, recordLoginFailure, recordLoginSuccess } from './login-attempts.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueRefreshToken, revokeRawRefreshToken, revokeUserRefreshTokens, rotateRefreshToken } from './refresh-tokens.js';
import { recordAudit } from '../audit/record.js';
import { problem } from '../http/problem.js';
import { createAccessToken } from './tokens.js';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  companyName: z.string().trim().min(2).max(160),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

function sessionCookies(
  response: Response,
  access: string,
  refresh: string,
): void {
  setAccessCookie(response, access);
  setRefreshCookie(response, refresh);
  setCsrfCookie(response, newCsrfToken());
}

function publicSession(
  user: { id: string; name: string; email: string; mustChangePassword?: boolean },
  company: { id: string; name: string },
  role: string,
) {
  return {
    user: {
      id: user.id, name: user.name, email: user.email,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
    company: { id: company.id, name: company.name },
    role,
  };
}

export const authRouter = Router();

authRouter.post('/register', async (request: Request, response: Response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    problem(response, 422, 'Données d’inscription invalides', parsed.error.flatten().fieldErrors);
    return;
  }
  const { name, email, password, companyName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    problem(response, 409, 'Cette adresse e-mail est déjà utilisée');
    return;
  }
  const passwordHash = await hashPassword(password);
  const created = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({ data: { name, email, passwordHash } });
    const company = await transaction.company.create({ data: { name: companyName } });
    await transaction.companyMembership.create({ data: { userId: user.id, companyId: company.id, role: 'ADMINISTRATEUR' } });
    return { user, company };
  });
  const access = createAccessToken({ userId: created.user.id, companyId: created.company.id, role: 'ADMINISTRATEUR' });
  const refresh = await issueRefreshToken(created.user.id);
  sessionCookies(response, access, refresh.raw);
  await recordAudit(request, {
    action: 'auth.register', companyId: created.company.id, userId: created.user.id,
    resource: 'user', resourceId: created.user.id,
  });
  response.status(201).json(publicSession(created.user, created.company, 'ADMINISTRATEUR'));
});

authRouter.post('/login', async (request: Request, response: Response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    problem(response, 422, 'Identifiants invalides');
    return;
  }
  const ip = clientIp(request);
  const email = parsed.data.email;
  if (await isLoginBlocked(email, ip)) {
    problem(response, 429, 'Trop de tentatives. Réessayez dans quinze minutes.');
    return;
  }
  const user = await prisma.user.findUnique({
    where: { email }, include: { memberships: { include: { company: true }, take: 1 } },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await recordLoginFailure(email, ip);
    problem(response, 401, 'Adresse e-mail ou mot de passe incorrect');
    return;
  }
  const membership = user.memberships[0];
  if (!membership) throw new Error('Utilisateur sans entreprise');
  await recordLoginSuccess(email, ip, user.id);
  const access = createAccessToken({ userId: user.id, companyId: membership.companyId, role: membership.role });
  const refresh = await issueRefreshToken(user.id);
  sessionCookies(response, access, refresh.raw);
  await recordAudit(request, {
    action: 'auth.login', companyId: membership.companyId, userId: user.id,
    resource: 'user', resourceId: user.id,
  });
  response.status(200).json(publicSession(
    { id: user.id, name: user.name, email: user.email, mustChangePassword: user.mustChangePassword },
    membership.company,
    membership.role,
  ));
});

authRouter.post('/refresh', async (request: Request, response: Response) => {
  const raw = readCookie(request, 'refresh_token');
  if (!raw) {
    problem(response, 401, 'Refresh manquant');
    return;
  }
  const rotated = await rotateRefreshToken(raw);
  if (rotated.kind === 'reuse') {
    clearAuthCookies(response);
    problem(response, 401, 'Refresh réutilisé : session révoquée');
    return;
  }
  if (rotated.kind !== 'ok') {
    clearAuthCookies(response);
    problem(response, 401, 'Refresh invalide ou expiré');
    return;
  }
  const membership = await prisma.companyMembership.findFirst({
    where: { userId: rotated.userId }, include: { company: true, user: true },
  });
  if (!membership) {
    clearAuthCookies(response);
    problem(response, 401, 'Session invalide');
    return;
  }
  const access = createAccessToken({
    userId: membership.userId, companyId: membership.companyId, role: membership.role,
  });
  sessionCookies(response, access, rotated.raw);
  response.status(200).json(publicSession(membership.user, membership.company, membership.role));
});

authRouter.get('/me', requireAuthentication, async (request: Request, response: Response) => {
  const auth = request.auth!;
  const membership = await prisma.companyMembership.findUnique({
    where: { userId_companyId: { userId: auth.userId, companyId: auth.companyId } },
    include: { user: true, company: true },
  });
  if (!membership) {
    problem(response, 401, 'Session invalide');
    return;
  }
  response.json(publicSession(membership.user, membership.company, membership.role));
});

authRouter.post('/change-password', requireAuthentication, async (request: Request, response: Response) => {
  const parsed = changePasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    problem(response, 422, 'Mot de passe invalide', parsed.error.flatten().fieldErrors);
    return;
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    problem(response, 422, 'Le nouveau mot de passe doit différer de l’actuel');
    return;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: request.auth!.userId } });
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    problem(response, 401, 'Mot de passe actuel incorrect');
    return;
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  await revokeUserRefreshTokens(user.id);
  const membership = await prisma.companyMembership.findFirstOrThrow({
    where: { userId: user.id }, include: { company: true },
  });
  const access = createAccessToken({ userId: user.id, companyId: membership.companyId, role: membership.role });
  const refresh = await issueRefreshToken(user.id);
  sessionCookies(response, access, refresh.raw);
  response.status(200).json(publicSession(
    { id: user.id, name: user.name, email: user.email, mustChangePassword: false },
    membership.company,
    membership.role,
  ));
});

authRouter.post('/logout', async (request: Request, response: Response) => {
  await revokeRawRefreshToken(readCookie(request, 'refresh_token'));
  clearAuthCookies(response);
  response.status(204).send();
});
