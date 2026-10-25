import { describe, expect, it } from 'vitest';
import { acceptanceDateError, companyCalendarYear, startOfCompanyDay } from './date-only.js';

describe('companyCalendarYear', () => {
  it('utilise le fuseau entreprise plutôt que UTC près du changement d’année', () => {
    // 31 déc 2025 23:30 UTC = 1 jan 2026 à Ouagadougou (UTC+0 en pratique... use Pacific)
    // Asia/Tokyo: 31 déc 2025 15:00 UTC = 1 jan 2026 00:00 JST
    const nearYearChange = new Date('2025-12-31T15:00:00.000Z');
    expect(companyCalendarYear('Asia/Tokyo', nearYearChange)).toBe(2026);
    expect(companyCalendarYear('UTC', nearYearChange)).toBe(2025);
  });
});

describe('acceptanceDateError', () => {
  const timeZone = 'Africa/Ouagadougou';
  const sentAt = new Date('2026-10-20T10:00:00.000Z');
  const today = startOfCompanyDay(timeZone, new Date('2026-10-24T12:00:00.000Z'));
  const validUntil = new Date('2026-11-01T00:00:00.000Z');

  it('accepte une date dans l’intervalle envoi ≤ acceptation ≤ min(validité, aujourd’hui)', () => {
    expect(acceptanceDateError({
      acceptanceDate: new Date('2026-10-22T00:00:00.000Z'),
      sentAt, validUntil, today, timeZone,
    })).toBeNull();
  });

  it('refuse une date antérieure à l’envoi', () => {
    expect(acceptanceDateError({
      acceptanceDate: new Date('2026-10-19T00:00:00.000Z'),
      sentAt, validUntil, today, timeZone,
    })).toMatch(/envoi/);
  });

  it('refuse une date postérieure à aujourd’hui', () => {
    expect(acceptanceDateError({
      acceptanceDate: new Date('2026-10-25T00:00:00.000Z'),
      sentAt, validUntil, today, timeZone,
    })).toMatch(/jour|validité/);
  });

  it('plafonne à la date de validité si elle précède aujourd’hui', () => {
    const shortValidity = new Date('2026-10-21T00:00:00.000Z');
    expect(acceptanceDateError({
      acceptanceDate: new Date('2026-10-22T00:00:00.000Z'),
      sentAt, validUntil: shortValidity, today, timeZone,
    })).toMatch(/jour|validité/);
    expect(acceptanceDateError({
      acceptanceDate: new Date('2026-10-21T00:00:00.000Z'),
      sentAt, validUntil: shortValidity, today, timeZone,
    })).toBeNull();
  });
});
