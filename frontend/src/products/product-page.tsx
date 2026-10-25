import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http';
import { formatMinorUnits } from '../money/format';
import { ProductForm } from './product-form';

export type Product = { id: string; version: number; name: string; description: string | null; unitPrice: string; unit: string; taxRateBasisPts: number };
type ProductList = { data: Product[]; meta: { total: number; totalPages: number } };
type Company = { currency: string; decimals: number };
export function ProductPage() {
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(1);
  const [result, setResult] = useState<ProductList | null>(null); const [company, setCompany] = useState<Company | null>(null); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState<Product | null | false>(false);
  const [reload, setReload] = useState(0); const [companyReload, setCompanyReload] = useState(0); const [error, setError] = useState(''); const [companyError, setCompanyError] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => { setPage(1); setQuery(search.trim()); }, 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { const controller = new AbortController(); setCompany(null); setCompanyError('');
    apiRequest<Company>('/company', { signal: controller.signal }).then(setCompany).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setCompanyError(cause instanceof Error ? cause.message : 'Impossible de charger la devise de l’entreprise.');
    });
    return () => controller.abort();
  }, [companyReload]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); const params = new URLSearchParams({ page: String(page), limit: '20' }); if (query) params.set('search', query);
    apiRequest<ProductList>(`/products?${params}`, { signal: controller.signal }).then(setResult).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Chargement impossible.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort();
  }, [page, query, reload]);
  const archive = async (product: Product) => {
    if (!window.confirm(`Archiver ${product.name} ?`)) return;
    try { await apiRequest(`/products/${product.id}/archive`, { method: 'POST', headers: { 'If-Match': `"${product.version}"` } }); setReload((n) => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Archivage impossible.'); }
  };
  return <section className="resource-page"><header className="page-heading"><div><span className="eyebrow">CATALOGUE</span><h1>Produits & services</h1><p>Vos prestations et tarifs réutilisables dans les devis.</p></div>
    <button className="button-primary button-compact" disabled={!company} onClick={() => setEditing(null)}>＋ Nouveau produit</button></header>
    <div className="resource-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un produit ou service" aria-label="Rechercher dans le catalogue" /></label><span className="result-count">{result?.meta.total ?? '—'} élément(s)</span></div>
    {companyError && <div className="page-alert" role="alert">Impossible de charger les paramètres de devise. {companyError}<button onClick={() => setCompanyReload((value) => value + 1)}>Réessayer</button></div>}
    {error && <div className="page-alert" role="alert">{error}<button onClick={() => { setError(''); setReload((n) => n + 1); }}>Réessayer</button></div>}
    {editing !== false && company && <ProductForm product={editing} currency={company.currency} decimals={company.decimals} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setReload((n) => n + 1); }} />}
    {loading ? <div className="panel empty-state" role="status">Chargement du catalogue…</div> : result?.data.length ? <div className="table-wrap"><table className="resource-table"><thead><tr><th>Produit ou service</th><th>Prix unitaire</th><th>Unité</th><th>Taxe</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {result.data.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.description ?? '—'}</small></td><td>{company ? formatMinorUnits(product.unitPrice, company.currency, company.decimals) : '—'}</td><td>{product.unit}</td><td>{(product.taxRateBasisPts / 100).toLocaleString('fr-FR')} %</td>
        <td className="row-actions"><button disabled={!company} onClick={() => setEditing(product)}>Modifier</button><button onClick={() => void archive(product)}>Archiver</button></td></tr>)}</tbody></table></div>
      : <div className="panel empty-state"><span className="placeholder-icon">◈</span><h2>{query ? 'Aucun résultat' : 'Votre catalogue est vide'}</h2><p>{query ? 'Essayez un autre terme.' : 'Ajoutez vos produits et services pour les réutiliser dans vos devis.'}</p>{!query && <button className="button-secondary" disabled={!company} onClick={() => setEditing(null)}>Ajouter un élément</button>}</div>}
    {result && result.meta.totalPages > 1 && <nav className="pagination" aria-label="Pages du catalogue"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédent</button><span>Page {page} sur {result.meta.totalPages}</span><button disabled={page >= result.meta.totalPages} onClick={() => setPage(page + 1)}>Suivant →</button></nav>}
  </section>;
}
