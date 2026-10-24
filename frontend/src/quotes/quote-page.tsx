import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http';
import { formatMinorUnits } from '../money/format';
import { deleteQuote, getQuote, listQuotes, quoteAction } from './quote-api';
import { QuoteEditor } from './quote-editor';
import type { CompanyMoney, Quote, QuoteStatus } from './quote-model';
import { todayForTimezone } from './quote-date';

const statuses: { value: QuoteStatus | ''; label: string }[] = [
  { value: '', label: 'Tous les devis' }, { value: 'BROUILLON', label: 'Brouillons' }, { value: 'ENVOYE', label: 'Envoyés' },
  { value: 'ACCEPTE', label: 'Acceptés' }, { value: 'REFUSE', label: 'Refusés' }, { value: 'EXPIRE', label: 'Expirés' }, { value: 'CONVERTI', label: 'Convertis' }, { value: 'ANNULE', label: 'Annulés' },
];
const statusLabel: Record<QuoteStatus, string> = { BROUILLON: 'Brouillon', ENVOYE: 'Envoyé', ACCEPTE: 'Accepté', REFUSE: 'Refusé', EXPIRE: 'Expiré', CONVERTI: 'Converti', ANNULE: 'Annulé' };
export function QuotePage() {
  const [status, setStatus] = useState<QuoteStatus | ''>(''); const [page, setPage] = useState(1); const [reload, setReload] = useState(0);
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof listQuotes>> | null>(null); const [company, setCompany] = useState<CompanyMoney>({ currency: 'XOF', decimals: 0, defaultTaxRateBasisPts: 0, timezone: 'UTC' });
  const [editor, setEditor] = useState<Quote | null | false>(false); const [accepting, setAccepting] = useState<Quote | null>(null);
  const [acceptanceDate, setAcceptanceDate] = useState(todayForTimezone()); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); setLoading(true);
    listQuotes(page, status || undefined, controller.signal).then(setQuotes).catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Chargement des devis impossible.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, status, reload]);
  useEffect(() => { apiRequest<CompanyMoney>('/company').then((settings) => { setCompany(settings); setAcceptanceDate(todayForTimezone(settings.timezone)); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Paramètres entreprise indisponibles.')); }, []);
  const reloadList = () => setReload((value) => value + 1);
  const edit = async (quote: Quote) => { try { setEditor(await getQuote(quote.id)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ouverture du devis impossible.'); } };
  const runAction = async (quote: Quote, action: 'send' | 'accept' | 'refuse' | 'cancel') => {
    try { await quoteAction(quote, action, action === 'accept' ? { acceptanceDate } : undefined); setAccepting(null); reloadList(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action impossible. Actualisez la liste puis réessayez.'); }
  };
  const remove = async (quote: Quote) => { if (!window.confirm('Supprimer définitivement ce brouillon ?')) return;
    try { await deleteQuote(quote); reloadList(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression impossible.'); }
  };
  if (editor !== false) return <QuoteEditor quote={editor ?? undefined} onCancel={() => setEditor(false)} onSaved={() => { setEditor(false); reloadList(); }} />;
  return <section className="resource-page"><header className="page-heading"><div><span className="eyebrow">VENTES</span><h1>Devis</h1><p>Préparez vos offres, suivez leur acceptation et téléchargez les PDF.</p></div>
    <button className="button-primary button-compact" onClick={() => setEditor(null)}>＋ Nouveau devis</button></header>
    <div className="resource-toolbar"><label className="form-field quote-status-filter"><span>Filtrer par statut</span><select value={status} onChange={(event) => { setStatus(event.target.value as QuoteStatus | ''); setPage(1); }}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><span className="result-count">{quotes?.meta.total ?? '—'} devis</span></div>
    {error && <div className="page-alert" role="alert">{error}<button onClick={() => { setError(''); reloadList(); }}>Réessayer</button></div>}
    {loading ? <div className="panel empty-state" role="status">Chargement des devis…</div> : quotes?.data.length ? <div className="table-wrap"><table className="resource-table quote-table"><thead><tr><th>Devis</th><th>Client</th><th>Échéance</th><th>Total TTC</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {quotes.data.map((quote) => <tr key={quote.id}><td><strong>{quote.number ?? 'Brouillon sans numéro'}</strong><small>Mis à jour le {new Date(quote.updatedAt ?? quote.createdAt ?? Date.now()).toLocaleDateString('fr-FR')}</small></td><td>{quote.client?.name ?? 'Client à choisir'}</td>
        <td>{quote.validUntil ? new Date(`${quote.validUntil.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR') : '—'}</td><td><strong>{formatMinorUnits(quote.totalInclTax, company.currency, company.decimals)}</strong></td><td><span className={`status-badge status-${quote.status.toLowerCase()}`}>{statusLabel[quote.status]}</span></td>
        <td className="row-actions quote-actions">{quote.status === 'BROUILLON' && <><button onClick={() => void edit(quote)}>Modifier</button><button onClick={() => void runAction(quote, 'send')}>Envoyer</button><button onClick={() => void remove(quote)}>Supprimer</button></>}
          {['ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'ANNULE', 'CONVERTI'].includes(quote.status) && <button onClick={() => { window.location.href = `/api/v1/quotes/${quote.id}/pdf`; }}>PDF</button>}
          {quote.status === 'ENVOYE' && <><button onClick={() => { const today = todayForTimezone(company.timezone); const maxDate = quote.validUntil?.slice(0, 10) && quote.validUntil.slice(0, 10) < today ? quote.validUntil.slice(0, 10) : today; setAcceptanceDate(maxDate); setAccepting(quote); }}>Accepter</button><button onClick={() => { if (window.confirm('Marquer ce devis comme refusé ?')) void runAction(quote, 'refuse'); }}>Refuser</button><button onClick={() => { if (window.confirm('Annuler ce devis envoyé ?')) void runAction(quote, 'cancel'); }}>Annuler</button></>}</td></tr>)}</tbody></table></div>
      : <div className="panel empty-state"><span className="placeholder-icon">▤</span><h2>{status ? 'Aucun devis dans ce statut' : 'Vous n’avez pas encore de devis'}</h2><p>Créez un brouillon avec un client et des prestations de votre catalogue.</p><button className="button-secondary" onClick={() => setEditor(null)}>Créer un devis</button></div>}
    {quotes && quotes.meta.totalPages > 1 && <nav className="pagination" aria-label="Pages de devis"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédent</button><span>Page {page} sur {quotes.meta.totalPages}</span><button disabled={page >= quotes.meta.totalPages} onClick={() => setPage(page + 1)}>Suivant →</button></nav>}
    {accepting && <div className="dialog-backdrop"><section className="resource-dialog acceptance-dialog" role="dialog" aria-modal="true" aria-labelledby="acceptance-title"><header><div><span className="eyebrow">ACCEPTATION DU DEVIS</span><h2 id="acceptance-title">Enregistrer l’accord du client</h2></div><button className="icon-button" onClick={() => setAccepting(null)} aria-label="Fermer">×</button></header>
      <label className="form-field"><span>Date réelle d’acceptation</span><input type="date" min={accepting.sentAt?.slice(0, 10)} max={accepting.validUntil?.slice(0, 10) && accepting.validUntil.slice(0, 10) < todayForTimezone(company.timezone) ? accepting.validUntil.slice(0, 10) : todayForTimezone(company.timezone)} value={acceptanceDate} onChange={(event) => setAcceptanceDate(event.target.value)} /></label>
      <footer><button className="button-secondary" onClick={() => setAccepting(null)}>Annuler</button><button className="button-primary" onClick={() => void runAction(accepting, 'accept')}>Confirmer l’acceptation</button></footer>
    </section></div>}
  </section>;
}
