import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { createAccessToken, verifyAccessToken } from './tokens.js';

describe('authentification', () => {
  it('ne conserve jamais le mot de passe en clair', async () => {
    const password = 'un-mot-de-passe-assez-long';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('mauvais-mot-de-passe', hash)).resolves.toBe(false);
  });

  it('signe et relit un jeton contenant le contexte entreprise', () => {
    process.env.JWT_SECRET = 'une-cle-de-test-de-plus-de-trente-deux-caracteres';
    const token = createAccessToken({ userId: 'user-1', companyId: 'company-1', role: 'ADMINISTRATEUR' });
    expect(verifyAccessToken(token)).toMatchObject({ userId: 'user-1', companyId: 'company-1', role: 'ADMINISTRATEUR' });
  });
});
