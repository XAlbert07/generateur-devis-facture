import { Link, useLocation } from 'react-router';

const titles: Record<string, string> = {
  '/devis': 'Devis', '/factures': 'Factures', '/entreprise': 'Paramètres de l’entreprise',
};

export function PlaceholderPage() {
  const { pathname } = useLocation();
  return <section className="placeholder-page"><span className="eyebrow">ESPACE DE TRAVAIL</span>
    <h1>{titles[pathname] ?? 'Page introuvable'}</h1>
    <div className="panel placeholder-card"><span className="placeholder-icon">✦</span>
      <h2>Cette section arrive bientôt</h2><p>Le prochain jalon reliera cet écran aux données de votre entreprise.</p>
      <Link className="button-secondary" to="/">Retour au tableau de bord</Link>
    </div>
  </section>;
}
