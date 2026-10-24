function dateParts(timezone = 'UTC'): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return { year: Number(parts.find((part) => part.type === 'year')?.value), month: Number(parts.find((part) => part.type === 'month')?.value), day: Number(parts.find((part) => part.type === 'day')?.value) };
}
export function todayForTimezone(timezone = 'UTC'): string {
  const { year, month, day } = dateParts(timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function dateAfterDays(timezone: string | undefined, days: number): string {
  const { year, month, day } = dateParts(timezone);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
