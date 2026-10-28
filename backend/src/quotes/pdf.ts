import PDFDocument from 'pdfkit';
import { readCompanyLogo } from '../companies/logo-storage.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(__dirname, '../../assets/fonts/LiberationSans-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '../../assets/fonts/LiberationSans-Bold.ttf');

type Snapshot = {
  quote?: Record<string, unknown>;
  document?: Record<string, unknown>;
  documentType?: 'DEVIS' | 'FACTURE';
  cancellation?: { cancelledAt?: unknown; reason?: unknown };
  company?: Record<string, unknown>;
  client?: Record<string, unknown> | null;
};

export type RenderPdfOptions = {
  /** Filigrane BROUILLON ; jamais pour un PDF stocké (§13). */
  draft?: boolean;
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

function stampDraftWatermark(doc: InstanceType<typeof PDFDocument>): void {
  doc.save();
  doc.fillColor('#94a3b8').fillOpacity(0.18).font(FONT_BOLD).fontSize(64);
  doc.rotate(-32, { origin: [297, 420] });
  doc.text('BROUILLON', 80, 380, { width: 440, align: 'center', lineBreak: false });
  doc.restore();
}

export async function renderDocumentPdf(value: unknown, options: RenderPdfOptions = {}): Promise<Buffer> {
  const snapshot = value as Snapshot;
  const draft = Boolean(options.draft);
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
  const heading = snapshot.cancellation
    ? documentType === 'DEVIS' ? 'DEVIS ANNULÉ' : 'FACTURE ANNULÉE'
    : draft
      ? `${documentType} (BROUILLON)`
      : documentType;
  const isQuote = documentType === 'DEVIS';
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: {
    Title: `${heading} ${text(quote.number, draft ? 'BROUILLON' : '')}`,
    Author: text(company.name), CreationDate: sentAt,
  } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (draft) {
    stampDraftWatermark(doc);
    doc.on('pageAdded', () => stampDraftWatermark(doc));
  }

  if (isQuote) {
    doc.rect(0, 0, 595.28, 150).fill('#172554');
    if (logo) doc.image(logo, 48, 34, { fit: [68, 58], align: 'center', valign: 'center' });
    const brandX = logo ? 132 : 48;
    doc.fillColor('#ffffff').fontSize(17).font(FONT_BOLD).text(text(company.name), brandX, 34, { width: 205 });
    let companyY = doc.y + 7;
    const companyLines = [company.address, company.phone, company.email]
      .filter((value) => typeof value === 'string' && value.length > 0);
    companyLines.push(...textEntries(company.taxIdentifiers).map(([label, value]) => `${label} : ${value}`));
    for (const line of companyLines.slice(0, 4)) {
      doc.fillColor('#cbd5e1').font(FONT_REGULAR).fontSize(8).text(text(line), brandX, companyY, { width: 215 });
      companyY = doc.y + 3;
    }
    doc.fillColor('#93c5fd').font(FONT_BOLD).fontSize(10).text('DOCUMENT COMMERCIAL', 355, 30, { width: 190, align: 'right' });
    doc.fillColor('#ffffff').font(FONT_BOLD).fontSize(28).text('DEVIS', 355, 48, { width: 190, align: 'right' });
    doc.fillColor('#dbeafe').font(FONT_BOLD).fontSize(13).text(text(quote.number, 'BROUILLON'), 355, 82, { width: 190, align: 'right' });
    const stateLabel = snapshot.cancellation ? 'ANNULÉ' : draft ? 'BROUILLON' : 'OFFRE À ACCEPTER';
    doc.fillColor(snapshot.cancellation ? '#fecaca' : draft ? '#fde68a' : '#a7f3d0')
      .font(FONT_BOLD).fontSize(9).text(stateLabel, 355, 108, { width: 190, align: 'right' });
    doc.y = 170;
  } else {
    const brandX = logo ? 132 : 48;
    const brandWidth = logo ? 195 : 290;
    if (logo) doc.image(logo, 48, 38, { fit: [72, 54], align: 'center', valign: 'center' });
    doc.fillColor('#172554').fontSize(18).font(FONT_BOLD).text(text(company.name), brandX, 40, { width: brandWidth });
    const companyNameBottom = doc.y;
    doc.fillColor(snapshot.cancellation ? '#b91c1c' : draft ? '#b45309' : '#0f766e').fontSize(12)
      .text(heading, 365, 44, { width: 182, align: 'right' });
    doc.fillColor('#172554').fontSize(14).font(FONT_BOLD)
      .text(text(quote.number, draft ? 'BROUILLON' : '—'), 345, 64, { width: 200, align: 'right' });
    let companyY = Math.max(66, companyNameBottom + 3);
    const companyLines = [company.address, company.phone, company.email].filter((value) => typeof value === 'string' && value.length > 0);
    companyLines.push(...textEntries(company.taxIdentifiers).map(([label, value]) => `${label} : ${value}`));
    for (const line of companyLines) {
      doc.fillColor('#475569').font(FONT_REGULAR).fontSize(8).text(text(line), brandX, companyY, { width: brandWidth });
      companyY = doc.y + 2;
    }
    const separatorY = Math.max(102, companyY + 6);
    doc.y = separatorY;
    doc.strokeColor('#cbd5e1').moveTo(48, separatorY).lineTo(547, separatorY).stroke();
  }
  if (snapshot.cancellation) {
    const cancellationText = `${isQuote ? 'ANNULÉ' : 'ANNULÉE'} le ${text(snapshot.cancellation.cancelledAt)} — ${text(snapshot.cancellation.reason)}`;
    doc.fillColor('#991b1b').font(FONT_BOLD).fontSize(9);
    const bannerY = doc.y;
    const bannerHeight = Math.max(30, doc.heightOfString(cancellationText, { width: 483 }) + 12);
    doc.roundedRect(48, bannerY, 499, bannerHeight, 5).fill('#fee2e2');
    doc.fillColor('#991b1b').text(cancellationText, 56, bannerY + 7, { width: 483 });
    doc.y = bannerY + bannerHeight + 12;
  }
  const dateLabel = documentType === 'FACTURE' ? 'Émise le' : 'Envoyé le';
  const endDate = documentType === 'FACTURE' ? quote.dueDate : quote.validUntil;
  const endLabel = documentType === 'FACTURE' ? 'Échéance' : 'Valable jusqu’au';
  if (isQuote) {
    const blockY = doc.y + 5;
    doc.roundedRect(48, blockY, 258, 100, 6).fill('#f8fafc');
    doc.fillColor('#64748b').font(FONT_BOLD).fontSize(8).text('DEVIS ÉTABLI POUR', 62, blockY + 12);
    doc.fillColor('#0f172a').font(FONT_BOLD).fontSize(13).text(text(client.name), 62, blockY + 29, { width: 232 });
    let clientY = doc.y + 2;
    for (const field of ['address', 'email', 'phone', 'taxIdentifier']) {
      if (client[field]) {
        doc.fillColor('#475569').font(FONT_REGULAR).fontSize(8).text(text(client[field]), 62, clientY, { width: 232 });
        clientY = doc.y + 2;
      }
    }
    doc.roundedRect(320, blockY, 227, 100, 6).fill('#eff6ff');
    doc.fillColor('#64748b').font(FONT_BOLD).fontSize(8).text('DATE D’ÉMISSION', 334, blockY + 13);
    doc.fillColor('#172554').font(FONT_BOLD).fontSize(11).text(dateText(timestamp), 334, blockY + 27);
    doc.fillColor('#64748b').font(FONT_BOLD).fontSize(8).text('VALABLE JUSQU’AU', 334, blockY + 52);
    doc.fillColor('#172554').font(FONT_BOLD).fontSize(11).text(dateText(endDate), 334, blockY + 66);
    doc.y = blockY + 117;
  } else {
    doc.fillColor('#475569').fontSize(9).font(FONT_BOLD).text('CLIENT');
    doc.fillColor('#0f172a').fontSize(11).font(FONT_REGULAR).text(text(client.name));
    for (const field of ['address', 'email', 'phone', 'taxIdentifier']) {
      if (client[field]) doc.fillColor('#475569').fontSize(9).text(text(client[field]));
    }
    if (!draft) {
      doc.moveDown(0.7).fillColor('#475569').fontSize(9)
        .text(`${dateLabel} ${dateText(timestamp)}    ${endLabel} ${dateText(endDate)}`);
    } else {
      doc.moveDown(0.7).fillColor('#475569').fontSize(9)
        .text(`Document provisoire — ${endLabel} ${dateText(endDate)}`);
    }
    doc.moveDown(1.2);
  }

  const rows = Array.isArray(quote.lines) ? quote.lines as Record<string, unknown>[] : [];
  const drawHead = () => {
    const y = doc.y < 48 ? 48 : doc.y;
    if (isQuote) {
      doc.fillColor('#64748b').font(FONT_BOLD).fontSize(8).text('DÉTAIL DE VOTRE OFFRE', 48, y, { width: 499 });
      doc.roundedRect(48, y + 17, 499, 27, 4).fill('#172554');
      doc.fillColor('#ffffff').font(FONT_BOLD).fontSize(7.5);
      doc.text('DÉSIGNATION', 57, y + 27, { width: 177 });
      doc.text('QTÉ', 237, y + 27, { width: 31, align: 'right' });
      doc.text('PRIX UNIT.', 274, y + 27, { width: 67, align: 'right' });
      doc.text('REMISE', 346, y + 27, { width: 55, align: 'right' });
      doc.text('TVA', 405, y + 27, { width: 39, align: 'right' });
      doc.text('TOTAL HT', 448, y + 27, { width: 90, align: 'right' });
      doc.y = y + 51;
    } else {
      doc.rect(48, y, 499, 24).fill('#eff6ff');
      doc.fillColor('#172554').font(FONT_BOLD).fontSize(8);
      doc.text('DÉSIGNATION', 56, y + 8, { width: 164 });
      doc.text('QTÉ', 222, y + 8, { width: 39, align: 'right' });
      doc.text('PRIX UNIT.', 264, y + 8, { width: 58, align: 'right' });
      doc.text('REMISE', 324, y + 8, { width: 62, align: 'right' });
      doc.text('TVA', 388, y + 8, { width: 48, align: 'right' });
      doc.text('TOTAL HT', 439, y + 8, { width: 100, align: 'right' });
      doc.y = y + 30;
    }
  };
  drawHead();
  for (const line of rows) {
    const description = text(line.description);
    const descriptionWidth = isQuote ? 174 : 160;
    const descriptionHeight = doc.heightOfString(description, { width: descriptionWidth });
    if (doc.y + Math.max(24, descriptionHeight) > 710) { doc.addPage(); drawHead(); }
    const y = doc.y;
    const rowHeight = Math.max(isQuote ? 34 : 24, descriptionHeight + 10);
    if (isQuote) {
      doc.roundedRect(48, y, 499, rowHeight, 3).fill('#f8fafc');
      doc.fillColor('#0f172a').font(FONT_REGULAR).fontSize(8.5).text(description, 57, y + 8, { width: 174 });
      doc.fontSize(8).text(quantity(line.quantityMilli), 237, y + 8, { width: 31, align: 'right' });
      doc.text(money(line.unitPrice, currency, decimals), 274, y + 8, { width: 67, align: 'right' });
      const lineDiscount = BigInt(text(line.discount, '0'));
      doc.text(lineDiscount ? money(lineDiscount, currency, decimals) : '—', 346, y + 8, { width: 55, align: 'right' });
      doc.text(`${rateText(line.taxRateBasisPts)} %`, 405, y + 8, { width: 39, align: 'right' });
      doc.fillColor('#172554').font(FONT_BOLD).text(money(line.net, currency, decimals), 448, y + 8, { width: 90, align: 'right' });
    } else {
      doc.fillColor('#0f172a').font(FONT_REGULAR).fontSize(9).text(description, 56, y, { width: 160 });
      doc.fontSize(8).text(quantity(line.quantityMilli), 222, y, { width: 39, align: 'right' });
      doc.text(money(line.unitPrice, currency, decimals), 264, y, { width: 58, align: 'right' });
      const lineDiscount = BigInt(text(line.discount, '0'));
      doc.text(lineDiscount ? money(lineDiscount, currency, decimals) : '—', 324, y, { width: 62, align: 'right' });
      doc.text(`${rateText(line.taxRateBasisPts)} %`, 388, y, { width: 48, align: 'right' });
      doc.text(money(line.net, currency, decimals), 439, y, { width: 100, align: 'right' });
    }
    doc.y = y + rowHeight + (isQuote ? 5 : 7);
  }
  const taxBreakdown = Array.isArray(quote.taxBreakdown) ? quote.taxBreakdown as Record<string, unknown>[] : [];
  if (isQuote) {
    const amountRows: Array<[string, unknown]> = [
      ['Sous-total HT', quote.subtotalExclTax],
      ['Remise', quote.globalDiscount],
      ...taxBreakdown.map((tax): [string, unknown] => [`TVA ${rateText(tax.taxRateBasisPts)} %`, tax.tax]),
      ['Total TVA', quote.totalTax],
    ];
    const cardHeight = amountRows.length * 19 + 52;
    if (doc.y + cardHeight + 115 > 760) { doc.addPage(); doc.y = 48; }
    const cardY = doc.y + 10;
    doc.roundedRect(285, cardY, 262, cardHeight, 6).fill('#f1f5f9');
    amountRows.forEach(([label, amount], index) => {
      const rowY = cardY + 12 + index * 19;
      doc.fillColor('#475569').font(FONT_REGULAR).fontSize(9).text(label, 299, rowY, { width: 125 });
      doc.fillColor('#0f172a').font(FONT_REGULAR).fontSize(9).text(money(amount, currency, decimals), 424, rowY, { width: 109, align: 'right' });
    });
    const totalY = cardY + amountRows.length * 19 + 13;
    doc.roundedRect(294, totalY, 244, 31, 4).fill('#172554');
    doc.fillColor('#ffffff').font(FONT_BOLD).fontSize(10).text('TOTAL TTC', 305, totalY + 9, { width: 105 });
    doc.fontSize(12).text(money(quote.totalInclTax, currency, decimals), 410, totalY + 8, { width: 118, align: 'right' });
    doc.y = totalY + 43;
  } else {
    if (doc.y > 650) { doc.addPage(); doc.y = 48; }
    doc.moveDown(0.8);
    const totalLine = (label: string, amount: unknown, bold = false) => {
      doc.font(bold ? FONT_BOLD : FONT_REGULAR).fontSize(bold ? 12 : 10).fillColor('#0f172a');
      const rowY = doc.y; // même ordonnée pour le libellé et le montant (doc.y avance après chaque text())
      doc.text(label, 270, rowY, { width: 170 });
      doc.text(money(amount, currency, decimals), 440, rowY, { width: 107, align: 'right' });
      doc.moveDown(0.7);
    };
    totalLine('Sous-total HT', quote.subtotalExclTax);
    totalLine('Remise', quote.globalDiscount);
    for (const tax of taxBreakdown) totalLine(`TVA ${rateText(tax.taxRateBasisPts)} %`, tax.tax);
    totalLine('Total TVA', quote.totalTax);
    totalLine('Total TTC', quote.totalInclTax, true);
  }

  if (isQuote && !snapshot.cancellation) {
    if (doc.y > 630) { doc.addPage(); doc.y = 48; }
    const acceptanceY = doc.y + 13;
    doc.roundedRect(48, acceptanceY, 499, 100, 6).fill('#eff6ff');
    doc.fillColor('#172554').font(FONT_BOLD).fontSize(11).text('BON POUR ACCORD', 63, acceptanceY + 13);
    doc.fillColor('#475569').font(FONT_REGULAR).fontSize(8.5)
      .text('En signant ce devis, le client confirme son accord sur les prestations et le montant indiqués.', 63, acceptanceY + 32, { width: 465 });
    doc.strokeColor('#94a3b8').moveTo(63, acceptanceY + 76).lineTo(270, acceptanceY + 76).stroke();
    doc.moveTo(310, acceptanceY + 76).lineTo(532, acceptanceY + 76).stroke();
    doc.fillColor('#64748b').font(FONT_REGULAR).fontSize(7.5)
      .text('Date et signature du client', 63, acceptanceY + 81, { width: 207 })
      .text('Nom du signataire', 310, acceptanceY + 81, { width: 222 });
    doc.y = acceptanceY + 112;
  }

  const section = (title: string, lines: string[], fontSize = 9) => {
    if (!lines.length) return;
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.4).fillColor('#172554').font(FONT_BOLD).fontSize(9).text(title, 48, undefined, { width: 499 });
    for (const line of lines) {
      doc.fillColor('#475569').font(FONT_REGULAR).fontSize(fontSize);
      const height = doc.heightOfString(line, { width: 499 });
      if (doc.y + height > 760) doc.addPage();
      doc.text(line, 48, undefined, { width: 499 });
    }
  };
  if (company.paymentTerms) section('CONDITIONS DE PAIEMENT', [text(company.paymentTerms)]);
  section('COORDONNÉES DE RÈGLEMENT', textEntries(company.paymentDetails).map(([label, value]) => `${label} : ${value}`));
  if (company.legalMentions) section('MENTIONS LÉGALES', [text(company.legalMentions)], 8);
  if (company.footerText) section('INFORMATIONS', [text(company.footerText)], 8);
  doc.end();
  return completed;
}

export function renderQuotePdf(value: unknown, options: RenderPdfOptions = {}): Promise<Buffer> {
  return renderDocumentPdf(value, options);
}
