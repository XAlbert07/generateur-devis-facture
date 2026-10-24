import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, apiRequest } from '../api/http';
import { clientSchema, type Client } from './client-model';
import { z } from 'zod';
import type { InputHTMLAttributes } from 'react';

type Values = z.infer<typeof clientSchema>;
export function ClientForm({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(clientSchema), defaultValues: {
    name: client?.name ?? '', email: client?.email ?? '', phone: client?.phone ?? '', address: client?.address ?? '', taxIdentifier: client?.taxIdentifier ?? '',
  } });
  const submit = handleSubmit(async (values) => {
    setError(''); const body = { ...values, email: values.email || null, phone: values.phone || null, address: values.address || null, taxIdentifier: values.taxIdentifier || null };
    try { await apiRequest(client ? `/clients/${client.id}` : '/clients', { method: client ? 'PUT' : 'POST', headers: client ? { 'If-Match': `"${client.version}"` } : {}, body: JSON.stringify(body) }); onSaved(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible. Réessayez.'); }
  });
  return <div className="dialog-backdrop"><section className="resource-dialog" role="dialog" aria-modal="true" aria-labelledby="client-form-title">
    <header><div><span className="eyebrow">CARNET D’ADRESSES</span><h2 id="client-form-title">{client ? 'Modifier le client' : 'Nouveau client'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer">×</button></header>
    <form className="resource-form" onSubmit={submit} noValidate>{error && <div className="form-alert" role="alert">{error}</div>}
      <Field label="Nom ou raison sociale" error={errors.name?.message} {...register('name')} />
      <div className="form-columns"><Field label="Adresse e-mail" type="email" error={errors.email?.message} {...register('email')} /><Field label="Téléphone" type="tel" error={errors.phone?.message} {...register('phone')} /></div>
      <Field label="Adresse" error={errors.address?.message} {...register('address')} /><Field label="Identifiant fiscal" error={errors.taxIdentifier?.message} {...register('taxIdentifier')} />
      <footer><button type="button" className="button-secondary" onClick={onClose}>Annuler</button><button className="button-primary" disabled={isSubmitting}>{isSubmitting ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
    </form>
  </section></div>;
}
function Field({ label, error, ...props }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="form-field"><span>{label}</span><input {...props} aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>;
}
