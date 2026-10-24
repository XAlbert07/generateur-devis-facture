import { useState, type InputHTMLAttributes } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest } from '../api/http';
import { minorUnitsToInput, parseMajorUnits, parseTaxPercent } from '../money/format';
import type { Product } from './product-page';

const schema = z.object({
  name: z.string().trim().min(2, 'Saisissez au moins 2 caractères.').max(160),
  description: z.string().max(2_000), unitPrice: z.string().min(1, 'Saisissez un prix.').refine((value) => /^\d+(?:[.,]\d*)?$/.test(value.trim()), 'Saisissez un prix valide.'),
  unit: z.string().trim().min(1, 'Saisissez une unité.').max(30), tax: z.string().refine((value) => { try { parseTaxPercent(value); return true; } catch { return false; } }, 'Taux entre 0 et 100 %, avec au plus deux décimales.'),
});
type Values = z.infer<typeof schema>;

export function ProductForm({ product, currency, decimals, onClose, onSaved }: { product: Product | null; currency: string; decimals: number; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: {
    name: product?.name ?? '', description: product?.description ?? '', unitPrice: product ? minorUnitsToInput(product.unitPrice, decimals) : '', unit: product?.unit ?? 'unité',
    tax: product ? (product.taxRateBasisPts / 100).toFixed(2).replace(/\.?0+$/, '') : '0',
  } });
  const submit = handleSubmit(async (values) => {
    setError('');
    try {
      const body = { name: values.name, description: values.description || null, unitPrice: parseMajorUnits(values.unitPrice, decimals), unit: values.unit, taxRateBasisPts: parseTaxPercent(values.tax) };
      await apiRequest(product ? `/products/${product.id}` : '/products', { method: product ? 'PUT' : 'POST', headers: product ? { 'If-Match': `"${product.version}"` } : {}, body: JSON.stringify(body) }); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.'); }
  });
  return <div className="dialog-backdrop"><section className="resource-dialog" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
    <header><div><span className="eyebrow">CATALOGUE</span><h2 id="product-form-title">{product ? 'Modifier l’élément' : 'Nouveau produit ou service'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer">×</button></header>
    <form className="resource-form" onSubmit={submit} noValidate>{error && <div className="form-alert" role="alert">{error}</div>}
      <Field label="Nom" error={errors.name?.message} {...register('name')} /><Field label="Description" error={errors.description?.message} {...register('description')} />
      <div className="form-columns"><Field label={`Prix unitaire (${currency})`} inputMode="decimal" placeholder={decimals ? '0,00' : '0'} error={errors.unitPrice?.message} {...register('unitPrice')} />
        <Field label="Unité" placeholder="unité, heure, forfait…" error={errors.unit?.message} {...register('unit')} /></div>
      <Field label="Taux de taxe (%)" inputMode="decimal" placeholder="0" error={errors.tax?.message} {...register('tax')} />
      <footer><button type="button" className="button-secondary" onClick={onClose}>Annuler</button><button className="button-primary" disabled={isSubmitting}>{isSubmitting ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
    </form>
  </section></div>;
}
function Field({ label, error, ...props }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="form-field"><span>{label}</span><input {...props} aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>;
}
