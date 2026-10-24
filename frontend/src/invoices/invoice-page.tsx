import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http';
import { formatMinorUnits } from '../money/format';
import { QuoteEditor } from '../quotes/quote-editor';
import { listQuotes } from '../quotes/quote-api';
import type { Quote } from '../quotes/quote-model';
import { cancelInvoice, convertQuote, deleteInvoice, getInvoice, issueInvoice, listInvoices } from './invoice-api';
import type { Invoice, InvoiceStatus } from './invoice-model';
import { PaymentManager } from '../payments/payment-manager';
import { getPayments } from '../payments/payment-api';

const invoiceStatuses: { value: InvoiceStatus | ''; label: string }[] = [
  { value: '', label: 'Toutes les factures' }, { value: 'BROUILLON', label: 'Brouillons' }, { value: 'EMISE', label: 'Émises' }, { value: 'ANNULEE', label: 'Annulées' },
];
const statusNames: Record<InvoiceStatus, string> = { BROUILLON: 'Brouillon', EMISE: 'Émise', ANNULEE: 'Annulée' };
type Company = { currency: string; decimals: number; timezone?: string };

export function InvoicePage() {
  const [status, setStatus] = useState<InvoiceStatus | ''>(''); const [page, setPage] = useState(1); const [acceptedPage, setAcceptedPage] = useState(1); const [reload, setReload] = useState(0);
  const [invoices, setInvoices] = useState<Awaited<ReturnType<typeof listInvoices>> | null>(null); const [accepted, setAccepted] = useState<Awaited<ReturnType<typeof listQuotes>> | null>(null);
  const [company, setCompany] = useState<Company>({ currency: 'XOF', decimals: 0 }); const [editing, setEditing] = useState<Invoice | null | false>(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null); const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [actionLoading, setActionLoading] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); setLoading(true);
    Promise.all([listInvoices(page, status || undefined, controller.signal), listQuotes(acceptedPage, 'ACCEPTE', controller.signal)])
      .then(([invoiceResult, quoteResult]) => { setInvoices(invoiceResult); setAccepted(quoteResult); })
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Chargement des factures impossible.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, status, acceptedPage, reload]);
  useEffect(() => { apiRequest<Company>('/company').then(setCompany).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Devise entreprise indisponible.')); }, []);
  const refresh = () => setReload((value) => value + 1);
  const edit = async (invoice: Invoice) => { try { setEditing(await getInvoice(invoice.id)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ouverture du brouillon impossible.'); } };
  const convert = async (quote: Quote) => { if (!window.confirm(`Créer un brouillon de facture depuis le devis ${quote.number ?? ''} ?`)) return;
    setActionLoading(quote.id); setError(''); try { await convertQuote(quote.id, quote.version); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Conversion impossible. Actualisez les devis acceptés.'); } finally { setActionLoading(null); }
  };
  const issue = async (invoice: Invoice) => { if (!window.confirm('Émettre cette facture ? Son numéro et son PDF seront figés.')) return;
    setActionLoading(invoice.id); setError(''); try { await issueInvoice(invoice); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Émission impossible.'); } finally { setActionLoading(null); }
  };
  const remove = async (invoice: Invoice) => { if (!window.confirm('Supprimer ce brouillon ? Un devis source accepté sera réouvert.')) return;
    setActionLoading(invoice.id); setError(''); try { await deleteInvoice(invoice); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression impossible.'); } finally { setActionLoading(null); }
  };
  const prepareCancellation = async (invoice: Invoice) => {
    setError(''); setActionLoading(invoice.id);
    try { const paymentList = await getPayments(invoice.id);
      if (BigInt(paymentList.summary.paid) > 0n) { setError('Cette facture porte encore des paiements valides. Annulez-les depuis « Paiements » avant d’annuler la facture.'); return; }
      setCancelReason(''); setCancelTarget(invoice);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vérification des paiements impossible.'); }
    finally { setActionLoading(null); }
  };
  const confirmCancellation = async () => {
    if (!cancelTarget || cancelReason.trim().length < 3) return;
    setActionLoading(cancelTarget.id); setError('');
    try { await cancelInvoice(cancelTarget, cancelReason.trim()); setCancelTarget(null); setCancelReason(''); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Annulation impossible. Actualisez la facture puis réessayez.'); }
    finally { setActionLoading(null); }
  };
  if (editing !== false) return <QuoteEditor kind="invoice" invoice={editing ?? undefined} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />;
  return <section className="resource-page"><header className="page-heading"><div><span className="eyebrow">VENTES</span><h1>Factures</h1><p>Convertissez les devis acceptés ou créez une facture manuelle.</p></div>
    <button className="button-primary button-compact" onClick={() => setEditing(null)}>＋ Nouvelle facture</button></header>
    {error && <div className="page-alert" role="alert">{error}<button onClick={() => { setError(''); refresh(); }}>Réessayer</button></div>}
    <section className="panel accepted-quotes"><div className="quote-section-title"><div><span className="eyebrow">CONVERSION</span><h2>Devis acceptés</h2></div><span className="result-count">{accepted?.meta.total ?? '—'} à convertir</span></div>
      {accepted?.data.length ? <div className="accepted-quote-list">{accepted.data.map((quote) => <article key={quote.id}><span><strong>{quote.number ?? 'Devis'}</strong><small>{quote.client?.name ?? 'Client'} · {formatMinorUnits(quote.totalInclTax, company.currency, company.decimals)}</small></span>
        <button className="button-secondary" disabled={actionLoading === quote.id} onClick={() => void convert(quote)}>{actionLoading === quote.id ? 'Conversion…' : 'Créer la facture'}</button></article>)}</div>
        : <p className="accepted-empty">Les devis acceptés apparaîtront ici.</p>}
      {accepted && accepted.meta.totalPages > 1 && <nav className="pagination" aria-label="Pages des devis acceptés"><button disabled={acceptedPage <= 1} onClick={() => setAcceptedPage(acceptedPage - 1)}>←</button><span>Page {acceptedPage} sur {accepted.meta.totalPages}</span><button disabled={acceptedPage >= accepted.meta.totalPages} onClick={() => setAcceptedPage(acceptedPage + 1)}>→</button></nav>}
    </section>
    <div className="resource-toolbar"><label className="form-field quote-status-filter"><span>Filtrer par statut</span><select value={status} onChange={(event) => { setStatus(event.target.value as InvoiceStatus | ''); setPage(1); }}>{invoiceStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><span className="result-count">{invoices?.meta.total ?? '—'} facture(s)</span></div>
    {loading ? <div className="panel empty-state" role="status">Chargement des factures…</div> : invoices?.data.length ? <div className="table-wrap"><table className="resource-table invoice-table"><thead><tr><th>Facture</th><th>Client</th><th>Échéance</th><th>Total TTC</th><th>Origine</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {invoices.data.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.number ?? 'Brouillon sans numéro'}</strong><small>{invoice.issueDate ? `Émise le ${new Date(invoice.issueDate).toLocaleDateString('fr-FR')}` : 'Non émise'}</small></td><td>{invoice.client?.name ?? 'Client à choisir'}</td><td>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-FR') : '—'}</td>
        <td><strong>{formatMinorUnits(invoice.totalInclTax, company.currency, company.decimals)}</strong></td><td>{invoice.origin === 'DEVIS' ? 'Devis' : 'Manuelle'}</td><td><span className={`status-badge status-${invoice.status.toLowerCase()}`}>{statusNames[invoice.status]}</span></td>
        <td className="row-actions">{invoice.status === 'BROUILLON' && <>{invoice.origin === 'MANUELLE' && <button onClick={() => void edit(invoice)}>Modifier</button>}<button disabled={actionLoading === invoice.id} onClick={() => void issue(invoice)}>{actionLoading === invoice.id ? 'Émission…' : 'Émettre'}</button><button onClick={() => void remove(invoice)}>Supprimer</button></>}
          {invoice.status !== 'BROUILLON' && <button onClick={() => { window.location.href = `/api/v1/invoices/${invoice.id}/pdf`; }}>PDF</button>}{invoice.status === 'EMISE' && <><button onClick={() => setPaymentInvoice(invoice)}>Paiements</button><button disabled={actionLoading === invoice.id} onClick={() => void prepareCancellation(invoice)}>{actionLoading === invoice.id ? 'Vérification…' : 'Annuler'}</button></>}{invoice.status === 'ANNULEE' && <button onClick={() => { window.location.href = `/api/v1/invoices/${invoice.id}/cancellation-pdf`; }}>PDF d’annulation</button>}</td></tr>)}</tbody></table></div>
      : <div className="panel empty-state"><span className="placeholder-icon">▧</span><h2>{status ? 'Aucune facture dans ce statut' : 'Aucune facture pour le moment'}</h2><p>Créez une facture manuelle ou convertissez un devis accepté.</p><button className="button-secondary" onClick={() => setEditing(null)}>Créer une facture</button></div>}
    {invoices && invoices.meta.totalPages > 1 && <nav className="pagination" aria-label="Pages de factures"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédent</button><span>Page {page} sur {invoices.meta.totalPages}</span><button disabled={page >= invoices.meta.totalPages} onClick={() => setPage(page + 1)}>Suivant →</button></nav>}
    {paymentInvoice && <PaymentManager invoiceId={paymentInvoice.id} invoiceNumber={paymentInvoice.number} company={{ ...company, defaultTaxRateBasisPts: 0 }} onClose={() => setPaymentInvoice(null)} onChanged={refresh} />}
    {cancelTarget && <div className="dialog-backdrop"><section className="resource-dialog cancellation-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-invoice-title"><header><div><span className="eyebrow">ANNULATION DE FACTURE</span><h2 id="cancel-invoice-title">Annuler {cancelTarget.number}</h2></div><button className="icon-button" onClick={() => setCancelTarget(null)} aria-label="Fermer">×</button></header>
      <p>Le PDF original restera disponible. Un PDF d’annulation sera créé avec le motif indiqué.</p><label className="form-field"><span>Motif (3 à 500 caractères)</span><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} rows={4} /></label>
      <footer><button className="button-secondary" onClick={() => setCancelTarget(null)}>Retour</button><button className="button-primary" disabled={actionLoading === cancelTarget.id || cancelReason.trim().length < 3} onClick={() => void confirmCancellation()}>{actionLoading === cancelTarget.id ? 'Annulation…' : 'Confirmer l’annulation'}</button></footer>
    </section></div>}
  </section>;
}
