import { prisma } from '../db/prisma.js';

/** Espaces d'essai dont la date d'expiration est dépassée. */
async function expiredSandboxIds(now: Date): Promise<string[]> {
  const expired = await prisma.company.findMany({
    where: { sandboxExpiresAt: { lt: now } },
    select: { id: true },
  });
  return expired.map((company) => company.id);
}

export async function countActiveSandboxes(now = new Date()): Promise<number> {
  return prisma.company.count({ where: { sandboxExpiresAt: { gte: now } } });
}

/**
 * Supprime des espaces d'essai et tout ce qu'ils contiennent, dans l'ordre des dépendances.
 * Seules les entreprises marquées comme espace d'essai sont concernées : une vraie entreprise
 * (sandboxExpiresAt nul) n'est jamais touchée, même si son identifiant est passé ici.
 * La suppression de documents n'est pas bloquée en base (voir la migration d'immuabilité).
 */
export async function purgeSandboxCompanies(requestedIds: string[]): Promise<number> {
  if (requestedIds.length === 0) return 0;
  return prisma.$transaction(async (tx) => {
    const sandboxes = await tx.company.findMany({
      where: { id: { in: requestedIds }, sandboxExpiresAt: { not: null } },
      select: { id: true },
    });
    const ids = sandboxes.map((company) => company.id);
    if (ids.length === 0) return 0;

    const memberships = await tx.companyMembership.findMany({ where: { companyId: { in: ids } }, select: { userId: true } });
    const userIds = [...new Set(memberships.map((membership) => membership.userId))];

    await tx.payment.deleteMany({ where: { invoice: { companyId: { in: ids } } } });
    await tx.invoice.deleteMany({ where: { companyId: { in: ids } } }); // lignes supprimées en cascade
    await tx.quote.deleteMany({ where: { companyId: { in: ids } } }); // lignes supprimées en cascade
    await tx.client.deleteMany({ where: { companyId: { in: ids } } });
    await tx.product.deleteMany({ where: { companyId: { in: ids } } });
    await tx.documentSequence.deleteMany({ where: { companyId: { in: ids } } });
    await tx.auditEvent.deleteMany({ where: { companyId: { in: ids } } });
    await tx.companyMembership.deleteMany({ where: { companyId: { in: ids } } });
    await tx.company.deleteMany({ where: { id: { in: ids } } }); // fichiers stockés supprimés en cascade
    // Un utilisateur d'essai n'appartient qu'à son espace ; ses jetons de session partent en cascade.
    await tx.user.deleteMany({ where: { id: { in: userIds }, memberships: { none: {} } } });
    return ids.length;
  }, { timeout: 60_000 });
}

export async function purgeExpiredSandboxes(now = new Date()): Promise<number> {
  return purgeSandboxCompanies(await expiredSandboxIds(now));
}

/** Supprime tous les espaces d'essai, expirés ou non (remise à zéro). */
export async function purgeAllSandboxes(): Promise<number> {
  const all = await prisma.company.findMany({ where: { sandboxExpiresAt: { not: null } }, select: { id: true } });
  return purgeSandboxCompanies(all.map((company) => company.id));
}
