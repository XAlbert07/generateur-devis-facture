import { describe, expect, it } from 'vitest';
import { summarizePayments } from './summary.js';

describe('solde et statut de paiement', () => {
  const today = new Date('2026-10-24T12:00:00.000Z');

  it('ignore les paiements annulés et identifie un paiement partiel', () => {
    const result = summarizePayments(1_000n, new Date('2026-10-30T00:00:00.000Z'), 'Africa/Ouagadougou', [
      { amount: 300n, cancelledAt: null }, { amount: 200n, cancelledAt: today },
    ], today);
    expect(result).toMatchObject({ total: 1_000n, paid: 300n, balance: 700n, status: 'PARTIELLEMENT_PAYEE' });
  });

  it('calcule les états payée, impayée et en retard', () => {
    expect(summarizePayments(1_000n, null, 'UTC', [{ amount: 1_000n, cancelledAt: null }], today).status).toBe('PAYEE');
    expect(summarizePayments(1_000n, null, 'UTC', [], today).status).toBe('IMPAYEE');
    expect(summarizePayments(1_000n, new Date('2026-10-23T00:00:00.000Z'), 'UTC', [{ amount: 1n, cancelledAt: null }], today).status).toBe('EN_RETARD');
  });
});
