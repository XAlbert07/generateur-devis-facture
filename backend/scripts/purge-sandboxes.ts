import { prisma } from '../src/db/prisma.js';
import { purgeAllSandboxes, purgeExpiredSandboxes } from '../src/sandbox/purge.js';

// npm run sandbox:purge           → supprime les espaces d'essai expirés
// npm run sandbox:purge -- --all  → supprime tous les espaces d'essai (remise à zéro)
const all = process.argv.includes('--all');
try {
  const count = all ? await purgeAllSandboxes() : await purgeExpiredSandboxes();
  console.log(`${count} espace(s) d'essai supprimé(s)${all ? ' (tous)' : ' (expirés)'}.`);
} finally {
  await prisma.$disconnect();
}
