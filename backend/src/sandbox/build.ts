import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password.js';
import { createAccessToken } from '../auth/tokens.js';
import { prisma } from '../db/prisma.js';
import { purgeSandboxCompanies } from './purge.js';
import { seedSandboxData } from './seed.js';

/** Durée accordée à la préparation d'un espace : au-delà, un espace jamais terminé est purgé. */
const BUILD_WINDOW_MS = 60 * 60 * 1000;
/** Durée de vie d'un espace complet qui attend un visiteur dans le réservoir. */
const POOL_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const COMPANY_NAME = 'Studio Aurore Communication';

// Tous les espaces d'essai partagent un mot de passe aléatoire que personne ne connaît :
// on n'y entre que par le bouton. Le calculer une seule fois évite un bcrypt par visiteur.
let unknowablePasswordHash: Promise<string> | undefined;
function sandboxPasswordHash(): Promise<string> {
  unknowablePasswordHash ??= hashPassword(randomBytes(32).toString('hex'));
  return unknowablePasswordHash;
}

export interface SandboxIdentity {
  userId: string;
  userName: string;
  userEmail: string;
  companyId: string;
  companyName: string;
}

/**
 * Crée un espace d'essai complet : entreprise, administrateur, puis données fictives.
 * `claimed: true` pour un visiteur qui attend (durée de vie = ttl) ; `false` pour le réservoir.
 * L'espace n'est marqué « prêt » qu'une fois entièrement rempli : un redémarrage en cours de
 * préparation ne peut donc jamais en livrer un incomplet. En cas d'échec, rien ne subsiste.
 */
export async function buildSandbox(baseUrl: string, options: { claimed: boolean; ttlHours: number }): Promise<SandboxIdentity> {
  const now = Date.now();
  const passwordHash = await sandboxPasswordHash();
  const { user, company } = await prisma.$transaction(async (transaction) => {
    const createdUser = await transaction.user.create({
      data: { name: 'Visiteur démo', email: `visiteur-${randomBytes(5).toString('hex')}@demo.invalid`, passwordHash },
    });
    const createdCompany = await transaction.company.create({
      data: {
        name: COMPANY_NAME,
        sandboxExpiresAt: new Date(now + (options.claimed ? options.ttlHours * 3_600_000 : BUILD_WINDOW_MS)),
        sandboxClaimedAt: options.claimed ? new Date(now) : null,
      },
    });
    await transaction.companyMembership.create({ data: { userId: createdUser.id, companyId: createdCompany.id, role: 'ADMINISTRATEUR' } });
    return { user: createdUser, company: createdCompany };
  });

  try {
    const accessToken = createAccessToken({ userId: user.id, companyId: company.id, role: 'ADMINISTRATEUR' });
    await seedSandboxData(baseUrl, accessToken);
    await prisma.company.update({
      where: { id: company.id },
      data: { sandboxReadyAt: new Date(), ...(options.claimed ? {} : { sandboxExpiresAt: new Date(Date.now() + POOL_MAX_AGE_MS) }) },
    });
  } catch (error) {
    await purgeSandboxCompanies([company.id]).catch(() => undefined);
    throw error;
  }
  return { userId: user.id, userName: user.name, userEmail: user.email, companyId: company.id, companyName: COMPANY_NAME };
}

/**
 * Attribue à un visiteur un espace complet du réservoir, et démarre sa durée de vie.
 * Atomique : deux visiteurs simultanés ne reçoivent jamais le même espace.
 */
export async function claimPooledSandbox(ttlHours: number): Promise<SandboxIdentity | null> {
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "entreprise"
    SET "sandbox_claimed_at" = now(), "sandbox_expires_at" = now() + make_interval(hours => ${ttlHours}::int)
    WHERE "id" = (
      SELECT "id" FROM "entreprise"
      WHERE "sandbox_ready_at" IS NOT NULL AND "sandbox_claimed_at" IS NULL AND "sandbox_expires_at" > now()
      ORDER BY "sandbox_ready_at"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  const companyId = claimed[0]?.id;
  if (!companyId) return null;
  const membership = await prisma.companyMembership.findFirstOrThrow({
    where: { companyId },
    include: { user: true, company: { select: { name: true } } },
  });
  return {
    userId: membership.user.id,
    userName: membership.user.name,
    userEmail: membership.user.email,
    companyId,
    companyName: membership.company.name,
  };
}

/** Nombre d'espaces complets qui attendent un visiteur. */
export async function countPooledSandboxes(now = new Date()): Promise<number> {
  return prisma.company.count({
    where: { sandboxReadyAt: { not: null }, sandboxClaimedAt: null, sandboxExpiresAt: { gt: now } },
  });
}
