import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/auth-context';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/** Prévient le visiteur d'un espace d'essai que ses données sont fictives et seront supprimées. */
export function SandboxBanner() {
  const { session } = useAuth();
  const companyId = session?.company.id;
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    apiRequest<{ sandbox: boolean; expiresAt: string | null }>('/sandbox/session')
      .then((result) => { if (active) setExpiresAt(result.sandbox && result.expiresAt ? new Date(result.expiresAt) : null); })
      .catch(() => { if (active) setExpiresAt(null); });
    return () => { active = false; };
  }, [companyId]);

  if (!expiresAt) return null;
  return <div className="sandbox-banner" role="status">
    <b>Espace d’essai</b>
    <span>Toutes les données sont fictives. Cet espace sera supprimé automatiquement le {dateFormat.format(expiresAt)}.</span>
  </div>;
}
