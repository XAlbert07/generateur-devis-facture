/** Début de la date courante dans le fuseau de l'entreprise, stockable en DATE. */
export function startOfCompanyDay(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)!.value;
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
}

/** Année civile de numérotation dans le fuseau de l'entreprise. */
export function companyCalendarYear(timeZone: string, now = new Date()): number {
  return startOfCompanyDay(timeZone, now).getUTCFullYear();
}

export function addDateOnlyDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/**
 * Vérifie `date_envoi ≤ date_acceptation ≤ min(date_validite, aujourd'hui)`.
 * Toutes les dates sont des DATE (minuit UTC).
 */
export function acceptanceDateError(input: {
  acceptanceDate: Date;
  sentAt: Date;
  validUntil: Date | null;
  today: Date;
  timeZone: string;
}): string | null {
  const sentDay = startOfCompanyDay(input.timeZone, input.sentAt);
  const upper = input.validUntil && input.validUntil.getTime() < input.today.getTime()
    ? input.validUntil
    : input.today;
  if (input.acceptanceDate.getTime() < sentDay.getTime()) {
    return 'La date d’acceptation ne peut pas précéder la date d’envoi du devis';
  }
  if (input.acceptanceDate.getTime() > upper.getTime()) {
    return 'La date d’acceptation doit être au plus la date du jour et au plus la date de validité';
  }
  return null;
}
