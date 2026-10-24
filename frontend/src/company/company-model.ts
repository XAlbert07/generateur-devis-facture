export type TextMap = Record<string, string> | null;
export type CompanySettings = {
  id: string; version: number; name: string; address: string | null; phone: string | null; email: string | null;
  taxIdentifiers: TextMap; logoHash: string | null; currency: string; decimals: number; defaultTaxRateBasisPts: number;
  timezone: string; quotePrefix: string; invoicePrefix: string; paymentDelayDays: number; legalMentions: string | null;
  footerText: string | null; paymentTerms: string | null; paymentDetails: TextMap;
};
export type KeyValue = { key: string; value: string };
export function textMapEntries(map: TextMap): KeyValue[] {
  return Object.entries(map ?? {}).map(([key, value]) => ({ key, value }));
}
export function entriesToTextMap(rows: KeyValue[]): TextMap {
  const values = Object.fromEntries(rows.filter((row) => row.key.trim() && row.value.trim()).map((row) => [row.key.trim(), row.value.trim()]));
  return Object.keys(values).length ? values : null;
}
