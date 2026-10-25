/**
 * Script opérateur (§15) : mot de passe temporaire + révocation des refresh.
 * Usage : node --env-file-if-exists=.env --import tsx backend/scripts/reset-password.ts email@exemple.com
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { hashPassword } from '../src/auth/password.js';
import { revokeUserRefreshTokens } from '../src/auth/refresh-tokens.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage : reset-password <email>');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error('Utilisateur introuvable');
  process.exit(1);
}

const temporary = `Tmp-${randomBytes(9).toString('base64url')}`;
await prisma.user.update({
  where: { id: user.id },
  data: {
    passwordHash: await hashPassword(temporary),
    mustChangePassword: true,
    lockedUntil: null,
  },
});
await revokeUserRefreshTokens(user.id);
console.log(`Mot de passe temporaire pour ${email} (une seule fois) :`);
console.log(temporary);
await prisma.$disconnect();
