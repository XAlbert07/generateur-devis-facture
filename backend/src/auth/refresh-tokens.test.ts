import { describe, expect, it } from 'vitest';
import { hashRefreshToken } from './refresh-tokens.js';

describe('refresh tokens', () => {
  it('empreinte SHA-256 stable et non réversible en clair', () => {
    const raw = 'jeton-de-test-refresh';
    expect(hashRefreshToken(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
    expect(hashRefreshToken(raw)).not.toBe(raw);
  });
});
