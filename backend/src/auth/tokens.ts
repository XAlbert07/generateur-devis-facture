import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  readonly userId: string;
  readonly companyId: string;
  readonly role: 'ADMINISTRATEUR' | 'GESTIONNAIRE' | 'COMPTABLE' | 'LECTEUR';
}

const accessTokenLifetime = '15m';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET doit contenir au moins 32 caractères');
  }
  return value;
}

export function createAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: accessTokenLifetime });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, secret());
  if (typeof payload === 'string' || !payload.userId || !payload.companyId || !payload.role) {
    throw new Error('Jeton d’accès invalide');
  }
  return { userId: payload.userId, companyId: payload.companyId, role: payload.role as AccessTokenPayload['role'] };
}
