import PDFDocument from 'pdfkit';
import { readCompanyLogo } from '../companies/logo-storage.js';

type Snapshot = {
  quote?: Record<string, unknown>;
  document?: Record<string, unknown>;
  documentType?: 'DEVIS' | 'FACTURE';
  cancellation?: { cancelledAt?: unknown; reason?: unknown };
  company?: Record<string, unknown>;
  client?: Record<string, unknown> | null;
};

function text(value: unknown, fallback = '—'): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function money(value: unknown, currency: string, decimals: number): string {
  const amount = BigInt(text(value, '0'));
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, '0');
  return `${whole.toLocaleString('fr-FR')}${decimals ? `,${fraction}` : ''} ${currency}`;
}

function quantity(value: unknown): string {
  const milli = BigInt(text(value, '0'));
  const whole = milli / 1_000n;
  const fraction = (milli % 1_000n).toString().padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole},${fraction}` : String(whole);
}

function textEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0);
}

function dateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const string = text(value, '—');
  return /^\d{4}-\d{2}-\d{2}T/.test(string) ? string.slice(0, 10) : string;
}

function rateText(value: unknown): string {
  const basisPoints = BigInt(text(value, '0'));
  const fraction = basisPoints % 100n;
  return `${basisPoints / 100n}${fraction ? `,${fraction.toString().padStart(2, '0')}` : ''}`;
}

export async function renderDocumentPdf(value: unknown): Promise<Buffer> {
  const snapshot = value as Snapshot;
  const quote = snapshot.document ?? snapshot.quote ?? {};
  const company = snapshot.company ?? {};
  const client = snapshot.client ?? {};
  const documentType = snapshot.documentType ?? 'DEVIS';
  const currency = text(quote.currency ?? company.currency, 'XOF').trim();
  const decimals = Number(company.decimals ?? 0);
  const logo = typeof company.id === 'string' && typeof company.logoReference === 'string' && typeof company.logoHash === 'string'
    ? await readCompanyLogo(company.id, company.logoReference, company.logoHash)
    : undefined;
  const timestamp = quote.sentAt ?? quote.issueDate;
  const creationDate = snapshot.cancellation?.cancelledAt ?? timestamp;
  const sentAt = creationDate instanceof Date ? creationDate : new Date(text(creationDate, '2000-01-01T00:00:00.000Z'));
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: {
    Title: `${snapshot.cancellation ? 'FACTURE ANNULÉE' : documentType} ${text(quote.number)}`,
    Author: text(company.name), CreationDate: sentAt,
  } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const brandX = logo ? 132 : 48;
  const brandWidth = logo ? 195 : 290;
  if (logo) doc.image(logo, 48, 38, { fit: [72, 54], align: 'center', valign: 'center' });
  doc.fillColor('#172554').fontSize(18).font('Helvetica-Bold').text(text(company.name), brandX, 40, { width: brandWidth });
  const companyNameBottom = doc.y;
  doc.fillColor(snapshot.cancellation ? '#b91c1c' : '#0f766e').fontSize(12)
    .text(snapshot.cancellation ? 'FACTURE ANNULÉE' : documentType, 365, 44, { width: 182, align: 'right' });
  doc.fillColor('#172554').fontSize(14).font('Helvetica-Bold').text(text(quote.number), 345, 64, { width: 200, align: 'right' });
  let companyY = Math.max(66, companyNameBottom + 3);
  const companyLines = [company.address, company.phone, company.email].filter((value) => typeof value === 'string' && value.length > 0);
  companyLines.push(...textEntries(company.taxIdentifiers).map(([label, value]) => `${label} : ${value}`));
  for (const line of companyLines) {
    doc.fillColor('#475569').font('Helvetica').fontSize(8).text(text(line), brandX, companyY, { width: brandWidth });
    companyY = doc.y + 2;
  }
  const separatorY = Math.max(102, companyY + 6);
  doc.y = separatorY;
  doc.strokeColor('#cbd5e1').moveTo(48, separatorY).lineTo(547, separatorY).stroke();
  if (snapshot.cancellation) {
    const cancellationText = `ANNULÉE le ${text(snapshot.cancellation.cancelledAt)} — ${text(snapshot.cancellation.reason)}`;
    doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(9);
    const bannerHeight = Math.max(30, doc.heightOfString(cancellationText, { width: 483 }) + 12);
    doc.rect(48, separatorY + 10, 499, bannerHeight).fill('#fee2e2');
    doc.fillColor('#991b1b').text(cancellationText, 56, separatorY + 16, { width: 483 });
    doc.y = separatorY + bannerHeight + 18;
  } else {
    doc.y = separatorY + 16;
  }
  doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text('CLIENT');
  doc.fillColor('#0f172a').fontSize(11).font('Helvetica').text(text(client.name));
  for (const field of ['address', 'email', 'phone', 'taxIdentifier']) {
    if (client[field]) doc.fillColor('#475569').fontSize(9).text(text(client[field]));
  }
  const dateLabel = documentType === 'FACTURE' ? 'Émise le' : 'Envoyé le';
  const endDate = documentType === 'FACTURE' ? quote.dueDate : quote.validUntil;
  const endLabel = documentType === 'FACTURE' ? 'Échéance' : 'Valable jusqu’au';
  doc.moveDown(0.7).fillColor('#475569').fontSize(9)
    .text(`${dateLabel} ${dateText(timestamp)}    ${endLabel} ${dateText(endDate)}`);
  doc.moveDown(1.2);

  const rows = Array.isArray(quote.lines) ? quote.lines as Record<string, unknown>[] : [];
  const drawHead = () => {
    const y = doc.y;
    doc.rect(48, y, 499, 24).fill('#eff6ff');
    doc.fillColor('#172554').font('Helvetica-Bold').fontSize(8);
    doc.text('DÉSIGNATION', 56, y + 8, { width: 164 });
    doc.text('QTÉ', 222, y + 8, { width: 39, align: 'right' });
    doc.text('PRIX UNIT.', 264, y + 8, { width: 58, align: 'right' });
    doc.text('REMISE', 324, y + 8, { width: 62, align: 'right' });
    doc.text('TVA', 388, y + 8, { width: 48, align: 'right' });
    doc.text('TOTAL HT', 439, y + 8, { width: 100, align: 'right' });
    doc.y = y + 30;
  };
  drawHead();
  for (const line of rows) {
    const description = text(line.description);
    const descriptionHeight = doc.heightOfString(description, { width: 160 });
    if (doc.y + Math.max(24, descriptionHeight) > 710) { doc.addPage(); drawHead(); }
    const y = doc.y;
    doc.fillColor('#0f172a').font('Helvetica').fontSize(9)
      .text(description, 56, y, { width: 160 });
    doc.fontSize(8).text(quantity(line.quantityMilli), 222, y, { width: 39, align: 'right' });
    doc.text(money(line.unitPrice, currency, decimals), 264, y, { width: 58, align: 'right' });
    const lineDiscount = BigInt(text(line.discount, '0'));
    doc.text(lineDiscount ? money(lineDiscount, currency, decimals) : '—', 324, y, { width: 62, align: 'right' });
    doc.text(`${rateText(line.taxRateBasisPts)} %`, 388, y, { width: 48, align: 'right' });
    doc.text(money(line.net, currency, decimals), 439, y, { width: 100, align: 'right' });
    doc.y = Math.max(doc.y, y + Math.max(24, descriptionHeight));
    doc.strokeColor('#e2e8f0').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.y += 7;
  }
  if (doc.y > 650) doc.addPage();
  doc.moveDown(0.8);
  const totalLine = (label: string, amount: unknown, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor('#0f172a');
    doc.text(label, 270, doc.y, { width: 170 });
    doc.text(money(amount, currency, decimals), 440, doc.y, { width: 107, align: 'right' });
    doc.moveDown(0.7);
  };
  totalLine('Sous-total HT', quote.subtotalExclTax);
  totalLine('Remise', quote.globalDiscount);
  const taxBreakdown = Array.isArray(quote.taxBreakdown) ? quote.taxBreakdown as Record<string, unknown>[] : [];
  for (const tax of taxBreakdown) {
    totalLine(`TVA ${rateText(tax.taxRateBasisPts)} %`, tax.tax);
  }
  totalLine('Total TVA', quote.totalTax);
  totalLine('Total TTC', quote.totalInclTax, true);
  const section = (title: string, lines: string[], fontSize = 9) => {
    if (!lines.length) return;
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.4).fillColor('#172554').font('Helvetica-Bold').fontSize(9).text(title, { width: 499 });
    for (const line of lines) {
      doc.fillColor('#475569').font('Helvetica').fontSize(fontSize);
      const height = doc.heightOfString(line, { width: 499 });
      if (doc.y + height > 760) doc.addPage();
      doc.text(line, { width: 499 });
    }
  };
  if (company.paymentTerms) section('CONDITIONS DE PAIEMENT', [text(company.paymentTerms)]);
  section('COORDONNÉES DE RÈGLEMENT', textEntries(company.paymentDetails).map(([label, value]) => `${label} : ${value}`));
  if (company.legalMentions) section('MENTIONS LÉGALES', [text(company.legalMentions)], 8);
  if (company.footerText) section('INFORMATIONS', [text(company.footerText)], 8);
  doc.end();
  return completed;
}

export function renderQuotePdf(value: unknown): Promise<Buffer> {
  return renderDocumentPdf(value);
}
