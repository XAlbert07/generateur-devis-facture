import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { apiRequest } from '../api/http';
import { useAuth } from './auth-context';

type Availability = 'checking' | 'available' | 'unavailable';

// L'API gratuite peut mettre environ une minute à se réveiller : on réessaie quelques fois avant
// de renoncer. Cet appel sert aussi à la réveiller, et à préparer les espaces d'essai, avant le clic.
function useSandboxAvailability(): Availability {
  const [availability, setAvailability] = useState<Availability>('checking');
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async (attempt: number) => {
      try {
        const { enabled } = await apiRequest<{ enabled: boolean }>('/sandbox');
        if (active) setAvailability(enabled ? 'available' : 'unavailable');
      } catch {
        if (!active) return;
        if (attempt >= 6) setAvailability('unavailable');
        else timer = setTimeout(() => { void check(attempt + 1); }, 5_000);
      }
    };
    void check(1);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, []);
  return availability;
}

export function SandboxEntry() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const availability = useSandboxAvailability();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (availability === 'unavailable') return null;

  const open = async () => {
    setError(null);
    setOpening(true);
    try {
      await apiRequest('/sandbox', { method: 'POST' });
      await refresh();
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’ouvrir la démo.');
    } finally {
      setOpening(false);
    }
  };

  return <div className="sandbox-entry">
    <div className="sandbox-divider"><span>Tu visites ce projet ?</span></div>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {availability === 'checking'
      ? <button type="button" className="sandbox-button" disabled>Réveil du serveur…</button>
      : <button type="button" className="sandbox-button" onClick={() => { void open(); }} disabled={opening}>
        {opening ? 'Ouverture de l’espace d’essai…' : 'Essayer la démo'}<span aria-hidden="true">→</span>
      </button>}
    <p className="sandbox-note">
      {availability === 'checking'
        ? 'Le serveur gratuit se réveille, cela peut prendre une minute. La démo apparaîtra ici.'
        : 'Un espace déjà rempli de clients, de devis et de factures, sans inscription. Les données sont fictives et supprimées automatiquement.'}
    </p>
  </div>;
}
