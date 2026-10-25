import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, apiRequest } from '../api/http';
import { useAuth } from '../auth/auth-context';
import { formatMinorUnits } from '../money/format';

type Summary = {
  generatedAt: string; currency: string;
  amounts: { billedExcludingTax: string; paid: string; outstanding: string; overdue: string };
  counts: { issuedInvoices: number; pendingQuotes: number };
};
type Company = { name: string; currency: string; decimals: number };

export function DashboardPage() {
  const { session } = useAuth();
  const [data, setData] = useState<{ summary: Summary; company: Company } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiRequest<Summary>('/dashboard/summary', { signal: controller.signal }),
      apiRequest<Company>('/company', { signal: controller.signal }),
    ]).then(([summary, company]) => setData({ summary, company }))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof ApiError ? cause.message : 'Impossible de charger les indicateurs.');
      }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const dateLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date());
  const company = data?.company;
  const summary = data?.summary;
  const amount = (value?: string) => value && company
    ? formatMinorUnits(value, company.currency, company.decimals)
    : '—';

  return <div className="dashboard-page">
    <header className="page-heading">
      <div><span className="eyebrow">{dateLabel}</span><h1>Bonjour, {session?.user.name.split(' ')[0]}.</h1>
        <p>Voici le résumé de votre activité.</p></div>
      <Link className="button-primary button-compact" to="/devis">＋ Nouveau devis</Link>
    </header>
    {error && <div className="page-alert" role="alert"><span>{error}</span><button onClick={() => window.location.reload()}>Réessayer</button></div>}
    {loading ? <div className="loading-grid" aria-label="Chargement des indicateurs"><i /><i /><i /><i /></div> : <>
      <section className="metric-grid" aria-label="Indicateurs financiers">
        <Metric title="Facturé HT" value={amount(summary?.amounts.billedExcludingTax)} hint={`${summary?.counts.issuedInvoices ?? 0} facture(s) émise(s)`} tone="blue" />
        <Metric title="Encaissé" value={amount(summary?.amounts.paid)} hint="Paiements valides" tone="green" />
        <Metric title="À recevoir" value={amount(summary?.amounts.outstanding)} hint="Solde des factures émises" tone="amber" />
        <Metric title="En retard" value={amount(summary?.amounts.overdue)} hint="Échéance dépassée" tone="rose" />
      </section>
      <section className="dashboard-lower">
        <article className="panel pending-panel">
          <div className="panel-heading"><div><span className="eyebrow">SUIVI COMMERCIAL</span><h2>Devis en attente</h2></div><span className="count-pill">{summary?.counts.pendingQuotes ?? 0}</span></div>
          <p>Les devis envoyés et encore valides apparaîtront ici.</p>
          <Link to="/devis" className="text-link">Consulter les devis <span aria-hidden="true">→</span></Link>
        </article>
        <article className="panel welcome-panel"><span className="welcome-mark">✦</span><span className="eyebrow">VOTRE ESPACE</span>
          <h2>{company?.name ?? 'Votre entreprise'}</h2><p>Préparez un devis, suivez vos factures et gardez une vue claire sur les paiements.</p>
          <Link to="/entreprise" className="text-link">Paramètres de l’entreprise <span aria-hidden="true">→</span></Link>
        </article>
      </section>
    </>}
  </div>;
}

function Metric({ title, value, hint, tone }: { title: string; value: string; hint: string; tone: string }) {
  return <article className="metric-card" aria-label={`${title} : ${value}`}>
    <div className="metric-top"><span>{title}</span><i className={`metric-dot ${tone}`} aria-hidden="true" /></div>
    <strong>{value}</strong><small>{hint}</small>
  </article>;
}
