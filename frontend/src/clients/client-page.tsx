import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http';
import { ClientForm } from './client-form';
import type { Client } from './client-model';

type ClientList = { data: Client[]; meta: { page: number; totalPages: number; total: number } };

export function ClientPage() {
  const [search, setSearch] = useState(''); const [query, setQuery] = useState('');
  const [page, setPage] = useState(1); const [result, setResult] = useState<ClientList | null>(null); const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Client | null | false>(false); const [error, setError] = useState(''); const [reload, setReload] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => { setPage(1); setQuery(search.trim()); }, 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (query) params.set('search', query);
    apiRequest<ClientList>(`/clients?${params}`, { signal: controller.signal }).then(setResult)
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Chargement impossible.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, query, reload]);

  const archive = async (client: Client) => {
    if (!window.confirm(`Archiver ${client.name} ?`)) return;
    try { await apiRequest(`/clients/${client.id}/archive`, { method: 'POST', headers: { 'If-Match': `"${client.version}"` } }); setReload((value) => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Archivage impossible.'); }
  };
  return <section className="resource-page">
    <header className="page-heading"><div><span className="eyebrow">CARNET D’ADRESSES</span><h1>Clients</h1><p>Retrouvez et gérez les coordonnées de vos clients.</p></div>
      <button className="button-primary button-compact" onClick={() => setEditing(null)}>＋ Nouveau client</button></header>
    <div className="resource-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un client" aria-label="Rechercher un client" /></label>
      <span className="result-count">{result?.meta.total ?? '—'} client(s)</span></div>
    {error && <div className="page-alert" role="alert">{error}<button onClick={() => { setError(''); setReload((value) => value + 1); }}>Réessayer</button></div>}
    {editing !== false && <ClientForm client={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setReload((value) => value + 1); }} />}
    {loading ? <div className="panel empty-state" role="status">Chargement des clients…</div> : result?.data.length ? <div className="table-wrap"><table className="resource-table"><thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Identifiant fiscal</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{result.data.map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.address ?? 'Aucune adresse renseignée'}</small></td><td>{client.email ?? '—'}</td><td>{client.phone ?? '—'}</td><td>{client.taxIdentifier ?? '—'}</td>
        <td className="row-actions"><button onClick={() => setEditing(client)}>Modifier</button><button onClick={() => void archive(client)}>Archiver</button></td></tr>)}</tbody></table></div>
      : <div className="panel empty-state"><span className="placeholder-icon">♙</span><h2>{query ? 'Aucun résultat' : 'Votre carnet est vide'}</h2><p>{query ? 'Essayez un autre nom.' : 'Ajoutez votre premier client pour préparer vos devis.'}</p>{!query && <button className="button-secondary" onClick={() => setEditing(null)}>Créer un client</button>}</div>}
    {result && result.meta.totalPages > 1 && <nav className="pagination" aria-label="Pages de clients"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédent</button><span>Page {page} sur {result.meta.totalPages}</span><button disabled={page >= result.meta.totalPages} onClick={() => setPage(page + 1)}>Suivant →</button></nav>}
  </section>;
}
