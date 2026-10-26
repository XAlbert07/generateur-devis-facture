import { beforeEach, describe, expect, it } from 'vitest';
import { refundIpSlot, releaseSlot, resetSandboxLimits, takeIpSlot, tryAcquireSlot } from './limits.js';

describe('limites anti-abus des espaces d’essai', () => {
  beforeEach(() => resetSandboxLimits());

  it('limite le nombre de créations par adresse IP et par heure', () => {
    const start = 1_000_000;
    expect(takeIpSlot('203.0.113.1', 2, start)).toBe(true);
    expect(takeIpSlot('203.0.113.1', 2, start + 1)).toBe(true);
    expect(takeIpSlot('203.0.113.1', 2, start + 2)).toBe(false);
    expect(takeIpSlot('203.0.113.2', 2, start + 2)).toBe(true);
  });

  it('libère les places après une heure', () => {
    const start = 1_000_000;
    takeIpSlot('203.0.113.1', 1, start);
    expect(takeIpSlot('203.0.113.1', 1, start + 59 * 60_000)).toBe(false);
    expect(takeIpSlot('203.0.113.1', 1, start + 61 * 60_000)).toBe(true);
  });

  it('rend la place d’une création qui a échoué sans faute du visiteur', () => {
    takeIpSlot('203.0.113.1', 1, 1_000_000);
    refundIpSlot('203.0.113.1');
    expect(takeIpSlot('203.0.113.1', 1, 1_000_001)).toBe(true);
  });

  it('borne le nombre de préparations simultanées', () => {
    expect(tryAcquireSlot(2)).toBe(true);
    expect(tryAcquireSlot(2)).toBe(true);
    expect(tryAcquireSlot(2)).toBe(false);
    releaseSlot();
    expect(tryAcquireSlot(2)).toBe(true);
  });
});
