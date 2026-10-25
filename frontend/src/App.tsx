import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth/auth-context';
import { ChangePasswordPage, LoginPage, RegisterPage } from './auth/auth-pages';
import { DashboardPage } from './dashboard/dashboard-page';
import { AppLayout } from './layout/app-layout';
import { ClientPage } from './clients/client-page';
import { ProductPage } from './products/product-page';
import { QuotePage } from './quotes/quote-page';
import { InvoicePage } from './invoices/invoice-page';
import { CompanyPage } from './company/company-page';

export function App() {
  return <AuthProvider><BrowserRouter><AppRoutes /></BrowserRouter></AuthProvider>;
}

function AppRoutes() {
  const { session, loading, error } = useAuth();
  if (loading) return <div className="boot-screen"><span className="brand-mark">D</span><p>Chargement de votre espace…</p></div>;
  const mustChange = Boolean(session?.user.mustChangePassword);
  return <>
    {error && <div className="connection-banner" role="status">{error} Vérifiez que l’API est démarrée.</div>}
    <Routes>
      <Route path="/login" element={session ? <Navigate to={mustChange ? '/changer-mot-de-passe' : '/'} replace /> : <LoginPage />} />
      <Route path="/register" element={session ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/changer-mot-de-passe" element={session ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />
      <Route element={session ? (mustChange ? <Navigate to="/changer-mot-de-passe" replace /> : <Outlet />) : <Navigate to="/login" replace />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientPage />} />
          <Route path="produits" element={<ProductPage />} />
          <Route path="devis" element={<QuotePage />} />
          <Route path="factures" element={<InvoicePage />} />
          <Route path="entreprise" element={<CompanyPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={session ? (mustChange ? '/changer-mot-de-passe' : '/') : '/login'} replace />} />
    </Routes>
  </>;
}
