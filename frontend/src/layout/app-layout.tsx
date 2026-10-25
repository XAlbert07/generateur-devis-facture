import { NavLink, Outlet, useNavigate, Link } from 'react-router';
import { useAuth } from '../auth/auth-context';

const navigation = [
  { to: '/', label: 'Vue d’ensemble', short: 'Accueil', end: true },
  { to: '/clients', label: 'Clients' },
  { to: '/produits', label: 'Produits & services', short: 'Produits' },
  { to: '/devis', label: 'Devis' },
  { to: '/factures', label: 'Factures' },
];

export function AppLayout() {
  const { session, logout } = useAuth(); const navigate = useNavigate();
  const signOut = async () => { try { await logout(); } finally { navigate('/login', { replace: true }); } };
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/" className="app-brand"><span className="brand-mark">D</span><span>Devis<span className="brand-light"> & factures</span></span></NavLink>
      <div className="company-switch"><span className="company-avatar">{session?.company.name.slice(0, 1).toUpperCase()}</span>
        <span><b>{session?.company.name}</b><small>Espace entreprise</small></span><span className="switch-chevron" aria-hidden="true">⌄</span>
      </div>
      <span className="nav-caption">ESPACE DE TRAVAIL</span>
      <nav className="main-nav" aria-label="Navigation principale">
        {navigation.map(({ to, label, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <span className="nav-symbol" aria-hidden="true">{navSymbol(to)}</span>{label}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom"><NavLink to="/entreprise" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><span className="nav-symbol" aria-hidden="true">⚙</span>Paramètres</NavLink>
        <Link to="/changer-mot-de-passe" className="nav-item"><span className="nav-symbol" aria-hidden="true">🔑</span>Mot de passe</Link>
        <button type="button" className="profile-button" onClick={signOut} aria-label="Se déconnecter">
          <span className="profile-avatar" aria-hidden="true">{session?.user.name.slice(0, 1).toUpperCase()}</span>
          <span><b>{session?.user.name}</b><small>{session?.role === 'ADMINISTRATEUR' ? 'Administrateur' : session?.role ?? 'Utilisateur'}</small></span><span className="logout-glyph" aria-hidden="true">↗</span>
        </button>
      </div>
    </aside>
    <main className="app-main"><div className="mobile-top"><span className="brand-mark" aria-hidden="true">D</span><b>{session?.company.name}</b><button type="button" onClick={signOut} aria-label="Se déconnecter">↗</button></div>
      <nav className="mobile-nav" aria-label="Navigation principale">{navigation.map(({ to, label, short, end }) =>
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}><span aria-hidden="true">{navSymbol(to)}</span>{short ?? label}</NavLink>)}
      </nav><Outlet /></main>
  </div>;
}

function navSymbol(path: string): string {
  return ({ '/': '◫', '/clients': '♙', '/produits': '◈', '/devis': '▤', '/factures': '▧' } as Record<string, string>)[path] ?? '•';
}
