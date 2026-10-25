import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError, apiRequest } from '../api/http';
import { useAuth } from './auth-context';

const loginSchema = z.object({ email: z.string().trim().email('Adresse e-mail invalide.'), password: z.string().min(1, 'Saisis ton mot de passe.') });
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Deux caractères minimum.'),
  companyName: z.string().trim().min(2, 'Deux caractères minimum.'),
  email: z.string().trim().email('Adresse e-mail invalide.'),
  password: z.string().min(12, '12 caractères minimum.'),
});
type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

function BrandPanel() {
  return <aside className="auth-art" aria-label="Aperçu du tableau de bord">
    <div className="art-orb art-orb-one" /><div className="art-orb art-orb-two" />
    <div className="art-copy"><span className="eyebrow">UNE GESTION PLUS CLAIRE</span>
      <h2>Votre activité,<br />bien organisée.</h2><p>Devis, factures et encaissements réunis au même endroit.</p>
    </div>
    <div className="art-card"><div className="art-card-top"><span>APERÇU DU MOIS</span><b>•••</b></div>
      <strong>2 450 000 <small>FCFA</small></strong><div className="art-chart"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div className="art-card-bottom"><span>Facturé ce mois</span><b>+12,8 %</b></div>
    </div>
    <div className="art-note"><span className="note-check">✓</span><span><b>Tout est à jour</b><small>Vos documents sont sauvegardés</small></span></div>
  </aside>;
}

function Field({ label, error, ...props }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="form-field"><span>{label}</span><input {...props} aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>;
}

function AuthFrame({ children, heading, subtitle }: { children: ReactNode; heading: string; subtitle: string }) {
  return <main className="auth-page"><section className="auth-main"><div className="mobile-brand"><span className="brand-mark">D</span> Devis & factures</div>
    <div className="auth-form-wrap"><div className="auth-heading"><span className="eyebrow">ESPACE PROFESSIONNEL</span><h1>{heading}</h1><p>{subtitle}</p></div>{children}</div>
    <footer className="auth-footer">© {new Date().getFullYear()} · Gestion simplifiée</footer></section><BrandPanel /></main>;
}

export function LoginPage() {
  const navigate = useNavigate(); const { refresh, error: sessionError } = useAuth(); const [error, setError] = useState<string | null>(sessionError);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(async (values) => {
    setError(null);
    try { await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(values) }); await refresh(); navigate('/', { replace: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Connexion impossible.'); }
  });
  return <AuthFrame heading="Bon retour." subtitle="Connecte-toi pour retrouver ton activité.">
    <form className="auth-form" onSubmit={submit} noValidate>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <Field label="Adresse e-mail" type="email" autoComplete="email" placeholder="nom@entreprise.com" error={errors.email?.message} {...register('email')} />
      <Field label="Mot de passe" type="password" autoComplete="current-password" placeholder="Ton mot de passe" error={errors.password?.message} {...register('password')} />
      <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? 'Connexion…' : 'Se connecter'}<span aria-hidden="true">→</span></button>
    </form>
    <p className="auth-switch">Pas encore de compte ? <Link to="/register">Créer mon espace</Link></p>
  </AuthFrame>;
}

export function RegisterPage() {
  const navigate = useNavigate(); const { refresh } = useAuth(); const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const submit = handleSubmit(async (values) => {
    setError(null);
    try { await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(values) }); await refresh(); navigate('/', { replace: true }); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Création du compte impossible.'); }
  });
  return <AuthFrame heading="Créer votre espace." subtitle="Quelques informations pour démarrer.">
    <form className="auth-form" onSubmit={submit} noValidate>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <Field label="Votre nom" autoComplete="name" placeholder="Prénom et nom" error={errors.name?.message} {...register('name')} />
      <Field label="Nom de l’entreprise" autoComplete="organization" placeholder="Ex. Atelier Kaboré" error={errors.companyName?.message} {...register('companyName')} />
      <Field label="Adresse e-mail" type="email" autoComplete="email" placeholder="nom@entreprise.com" error={errors.email?.message} {...register('email')} />
      <Field label="Mot de passe" type="password" autoComplete="new-password" placeholder="12 caractères minimum" error={errors.password?.message} {...register('password')} />
      <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? 'Création…' : 'Créer mon compte'}<span aria-hidden="true">→</span></button>
    </form>
    <p className="auth-switch">Déjà inscrit ? <Link to="/login">Se connecter</Link></p>
  </AuthFrame>;
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
  newPassword: z.string().min(12, '12 caractères minimum.'),
});
type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });
  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await apiRequest('/auth/change-password', { method: 'POST', body: JSON.stringify(values) });
      await refresh();
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Changement impossible.');
    }
  });
  return <AuthFrame heading="Nouveau mot de passe." subtitle="Pour sécuriser votre compte, choisissez un mot de passe personnel.">
    <form className="auth-form" onSubmit={submit} noValidate>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <Field label="Mot de passe actuel" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
      <Field label="Nouveau mot de passe" type="password" autoComplete="new-password" placeholder="12 caractères minimum" error={errors.newPassword?.message} {...register('newPassword')} />
      <button className="button-primary" disabled={isSubmitting}>{isSubmitting ? 'Enregistrement…' : 'Enregistrer'}<span aria-hidden="true">→</span></button>
    </form>
  </AuthFrame>;
}
