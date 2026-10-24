import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/auth-context';

const navigation = [
  { to: '/', label: 'Vue d’ensemble', short: 'Accueil', end: true },
  { to: '/clients', label: 'Clients' },
  { to: '/produits', label: 'Produits & services' },
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
        <span><b>{session?.company.name}</b><small>Espace entreprise</small></span><span className="switch-chevron">⌄</span>
      </div>
      <span className="nav-caption">ESPACE DE TRAVAIL</span>
      <nav className="main-nav" aria-label="Navigation principale">
        {navigation.map(({ to, label, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <span className="nav-symbol" aria-hidden="true">{navSymbol(to)}</span>{label}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom"><NavLink to="/entreprise" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><span className="nav-symbol">⚙</span>Paramètres</NavLink>
        <button className="profile-button" onClick={signOut}><span className="profile-avatar">{session?.user.name.slice(0, 1).toUpperCase()}</span>
          <span><b>{session?.user.name}</b><small>Administrateur</small></span><span className="logout-glyph" aria-hidden="true">↗</span></button>
      </div>
    </aside>
    <main className="app-main"><div className="mobile-top"><span className="brand-mark">D</span><b>{session?.company.name}</b><button onClick={signOut} aria-label="Se déconnecter">↗</button></div>
      <nav className="mobile-nav" aria-label="Navigation principale">{navigation.filter((item) => item.to !== '/produits').map(({ to, label, short, end }) =>
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}><span>{navSymbol(to)}</span>{short ?? label}</NavLink>)}
      </nav><Outlet /></main>
  </div>;
}

function navSymbol(path: string): string {
  return ({ '/': '◫', '/clients': '♙', '/produits': '◈', '/devis': '▤', '/factures': '▧' } as Record<string, string>)[path] ?? '•';
}
