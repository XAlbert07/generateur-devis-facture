import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAuthentication } from './authenticate.js';
import { hashPassword, verifyPassword } from './password.js';
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

function setAccessCookie(response: Response, token: string): void {
  response.cookie('access_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000,
    path: '/api/v1',
  });
}

function publicUser(user: { id: string; name: string; email: string }, company: { id: string; name: string }) {
  return { user, company, role: 'ADMINISTRATEUR' as const };
}

export const authRouter = Router();

authRouter.post('/register', async (request: Request, response: Response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(422).type('application/problem+json').json({
      title: 'Données d’inscription invalides', status: 422, errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const { name, email, password, companyName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    response.status(409).type('application/problem+json').json({ title: 'Cette adresse e-mail est déjà utilisée', status: 409 });
    return;
  }
  const passwordHash = await hashPassword(password);
  const created = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({ data: { name, email, passwordHash } });
    const company = await transaction.company.create({ data: { name: companyName } });
    await transaction.companyMembership.create({ data: { userId: user.id, companyId: company.id, role: 'ADMINISTRATEUR' } });
    return { user, company };
  });
  const token = createAccessToken({ userId: created.user.id, companyId: created.company.id, role: 'ADMINISTRATEUR' });
  setAccessCookie(response, token);
  response.status(201).json(publicUser(created.user, created.company));
});

authRouter.post('/login', async (request: Request, response: Response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(422).type('application/problem+json').json({ title: 'Identifiants invalides', status: 422 });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email }, include: { memberships: { include: { company: true }, take: 1 } },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    response.status(401).type('application/problem+json').json({ title: 'Adresse e-mail ou mot de passe incorrect', status: 401 });
    return;
  }
  const membership = user.memberships[0];
  if (!membership) throw new Error('Utilisateur sans entreprise');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = createAccessToken({ userId: user.id, companyId: membership.companyId, role: membership.role });
  setAccessCookie(response, token);
  response.status(200).json({ user: { id: user.id, name: user.name, email: user.email }, company: membership.company, role: membership.role });
});

authRouter.get('/me', requireAuthentication, async (request: Request, response: Response) => {
  const auth = request.auth!;
  const membership = await prisma.companyMembership.findUnique({
    where: { userId_companyId: { userId: auth.userId, companyId: auth.companyId } },
    include: { user: true, company: true },
  });
  if (!membership) {
    response.status(401).type('application/problem+json').json({ title: 'Session invalide', status: 401 });
    return;
  }
  response.json({
    user: { id: membership.user.id, name: membership.user.name, email: membership.user.email },
    company: { id: membership.company.id, name: membership.company.name }, role: membership.role,
  });
});

authRouter.post('/logout', (_request: Request, response: Response) => {
  response.clearCookie('access_token', { httpOnly: true, sameSite: 'lax', path: '/api/v1' });
  response.status(204).send();
});
