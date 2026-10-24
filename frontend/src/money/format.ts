export function formatMinorUnits(value: string, currency: string, decimals: number): string {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const grouped = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(whole);
  const decimalPart = decimals ? `,${fraction.toString().padStart(decimals, '0')}` : '';
  return `${negative ? '−' : ''}${grouped}${decimalPart} ${currency.trim()}`;
}

export function minorUnitsToInput(amount: string, decimals: number): string {
  const value = BigInt(amount);
  if (decimals === 0) return value.toString();
  const scale = 10n ** BigInt(decimals);
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${value / scale}${fraction ? `.${fraction}` : ''}`;
}

export function parseMajorUnits(input: string, decimals: number): string {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) throw new Error('Saisissez un prix valide.');
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) throw new Error(`La devise accepte au maximum ${decimals} décimale(s).`);
  const scale = 10n ** BigInt(decimals);
  return (BigInt(whole) * scale + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}

export function parseTaxPercent(input: string): number {
  const normalized = input.trim().replace(',', '.');
  if (!/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/.test(normalized)) throw new Error('Saisissez un taux entre 0 et 100 %, avec au plus deux décimales.');
  const [whole, fraction = ''] = normalized.split('.');
  return Number(BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)));
}
