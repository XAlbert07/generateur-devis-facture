import { describe, expect, it } from 'vitest';
import { addDateOnlyDays, startOfCompanyDay } from '../../../shared/documents/date-only.js';

describe('date de validité du devis', () => {
  it('compare les dates à partir du début du jour UTC', () => {
    expect(startOfCompanyDay('Africa/Ouagadougou', new Date('2026-10-24T19:45:00.000Z')).toISOString())
      .toBe('2026-10-24T00:00:00.000Z');
  });

  it('respecte le jour local du fuseau de l’entreprise', () => {
    expect(startOfCompanyDay('America/Los_Angeles', new Date('2026-10-24T01:00:00.000Z')).toISOString())
      .toBe('2026-10-23T00:00:00.000Z');
  });

  it('calcule les échéances en jours calendaires', () => {
    expect(addDateOnlyDays(new Date('2026-12-31T00:00:00.000Z'), 30).toISOString())
      .toBe('2027-01-30T00:00:00.000Z');
  });
});
