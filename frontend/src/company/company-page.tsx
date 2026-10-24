import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../auth/auth-context';
import { parseTaxPercent } from '../money/format';
import { ApiError } from '../api/http';
import { deleteCompanyLogo, getCompany, saveCompany, uploadCompanyLogo } from './company-api';
import { entriesToTextMap, textMapEntries, type CompanySettings, type KeyValue } from './company-model';

const schema = z.object({ name: z.string().trim().min(2, 'Saisissez au moins 2 caractères.').max(160), address: z.string().max(1_000), phone: z.string().max(40),
  email: z.union([z.literal(''), z.string().email('Adresse e-mail invalide.')]), currency: z.string().regex(/^[A-Z]{3}$/, 'Code devise en trois lettres majuscules.'),
  decimals: z.string().refine((value) => /^\d$/.test(value) && Number(value) <= 6, 'Choisissez entre 0 et 6 décimales.'),
  defaultTaxPercent: z.string().refine((value) => { try { parseTaxPercent(value); return true; } catch { return false; } }, 'Taux entre 0 et 100 %, avec au plus deux décimales.'),
  timezone: z.string().min(1, 'Saisissez un fuseau horaire.').refine((value) => { try { new Intl.DateTimeFormat('fr-FR', { timeZone: value }); return true; } catch { return false; } }, 'Fuseau horaire IANA invalide.'),
  quotePrefix: z.string().regex(/^[A-Z0-9]{1,12}$/, '1 à 12 lettres majuscules ou chiffres.'), invoicePrefix: z.string().regex(/^[A-Z0-9]{1,12}$/, '1 à 12 lettres majuscules ou chiffres.'),
  paymentDelayDays: z.string().regex(/^\d+$/, 'Saisissez un nombre de jours.').refine((value) => Number(value) <= 3_650, 'Maximum 3 650 jours.'),
  legalMentions: z.string().max(4_000), footerText: z.string().max(2_000), paymentTerms: z.string().max(2_000),
});
type Values = z.infer<typeof schema>;
function valuesFrom(company: CompanySettings): Values {
  const basis = BigInt(company.defaultTaxRateBasisPts); const fraction = (basis % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return { name: company.name, address: company.address ?? '', phone: company.phone ?? '', email: company.email ?? '', currency: company.currency,
    decimals: String(company.decimals), defaultTaxPercent: `${basis / 100n}${fraction ? `.${fraction}` : ''}`, timezone: company.timezone,
    quotePrefix: company.quotePrefix, invoicePrefix: company.invoicePrefix, paymentDelayDays: String(company.paymentDelayDays),
    legalMentions: company.legalMentions ?? '', footerText: company.footerText ?? '', paymentTerms: company.paymentTerms ?? '' };
}

export function CompanyPage() {
  const { session } = useAuth(); const isAdmin = session?.role === 'ADMINISTRATEUR';
  const [company, setCompany] = useState<CompanySettings | null>(null); const [taxRows, setTaxRows] = useState<KeyValue[]>([]); const [paymentRows, setPaymentRows] = useState<KeyValue[]>([]);
  const [error, setError] = useState(''); const [conflict, setConflict] = useState(false); const [loading, setLoading] = useState(true); const [logoBusy, setLogoBusy] = useState(false); const [mapsDirty, setMapsDirty] = useState(false);
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({ resolver: zodResolver(schema) });
  const currencyField = register('currency');
  const updateTaxRows = (rows: KeyValue[]) => { setTaxRows(rows); setMapsDirty(true); };
  const updatePaymentRows = (rows: KeyValue[]) => { setPaymentRows(rows); setMapsDirty(true); };
  const load = async () => { setLoading(true); setError(''); try { const current = await getCompany(); setCompany(current); reset(valuesFrom(current)); setTaxRows(textMapEntries(current.taxIdentifiers)); setPaymentRows(textMapEntries(current.paymentDetails)); setMapsDirty(false); setConflict(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chargement des paramètres impossible.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const submit = handleSubmit(async (values) => {
    if (!company || !isAdmin) return;
    setError('');
    for (const [rows, label] of [[taxRows, 'Identifiants fiscaux'], [paymentRows, 'Coordonnées de règlement']] as const) {
      if (rows.some((row) => Boolean(row.key.trim()) !== Boolean(row.value.trim()))) { setError(`${label} : complétez les deux champs de chaque ligne ou retirez la ligne vide.`); return; }
      const keys = rows.map((row) => row.key.trim().toLowerCase());
      if (new Set(keys).size !== keys.length) { setError(`${label} : chaque type doit être unique.`); return; }
    }
    try {
      const saved = await saveCompany({ name: values.name, address: values.address || null, phone: values.phone || null, email: values.email || null,
        taxIdentifiers: entriesToTextMap(taxRows), paymentDetails: entriesToTextMap(paymentRows), currency: values.currency, decimals: Number(values.decimals),
        defaultTaxRateBasisPts: parseTaxPercent(values.defaultTaxPercent), timezone: values.timezone, quotePrefix: values.quotePrefix, invoicePrefix: values.invoicePrefix,
        paymentDelayDays: Number(values.paymentDelayDays), legalMentions: values.legalMentions || null, footerText: values.footerText || null, paymentTerms: values.paymentTerms || null,
      }, company.version);
      setCompany(saved); reset(valuesFrom(saved)); setTaxRows(textMapEntries(saved.taxIdentifiers)); setPaymentRows(textMapEntries(saved.paymentDetails)); setMapsDirty(false);
    } catch (cause) { if (cause instanceof ApiError && cause.status === 409) { setConflict(true); setError('Les paramètres ont changé depuis leur chargement. Rechargez la version actuelle avant de modifier.'); }
      else setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.'); }
  });

  const logoAction = async (file?: File) => {
    if (!company || !isAdmin) return;
    if (file && (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024)) { setError('Choisissez un fichier PNG ou JPEG de 2 Mo maximum.'); return; }
    if (!file && !window.confirm('Supprimer le logo de l’entreprise ?')) return;
    setLogoBusy(true); setError(''); try {
      const result = file ? await uploadCompanyLogo(file, company.version) : await deleteCompanyLogo(company.version);
      setCompany({ ...company, version: result.version ?? company.version + 1, logoHash: file ? result.logoHash ?? company.logoHash : null });
    } catch (cause) { if (cause instanceof ApiError && cause.status === 409) { setConflict(true); setError('La version des paramètres est périmée. Rechargez la page avant de modifier le logo.'); }
      else setError(cause instanceof Error ? cause.message : 'Mise à jour du logo impossible.'); }
    finally { setLogoBusy(false); }
  };

  return <section className="company-page"><header className="page-heading"><div><span className="eyebrow">VOTRE ESPACE</span><h1>Paramètres de l’entreprise</h1><p>Ces coordonnées seront reprises sur les prochains devis et factures.</p></div></header>
    {error && <div className="page-alert" role="alert"><span>{error}</span>{conflict && <button onClick={() => void load()}>Recharger</button>}</div>}
    {loading ? <div className="panel empty-state" role="status">Chargement des paramètres…</div> : company && <>
      <section className="panel logo-settings"><div><span className="eyebrow">IDENTITÉ VISUELLE</span><h2>Logo</h2><p>PNG ou JPEG, maximum 2 Mo. Le fichier sera converti et optimisé.</p></div>
        {company.logoHash ? <img className="company-logo-preview" src={`/api/v1/company/logo?v=${company.logoHash}`} alt="Logo de l’entreprise" /> : <div className="company-logo-empty" aria-label="Aucun logo">D</div>}
        {isAdmin && <div className="logo-actions"><label className="button-secondary">{logoBusy ? 'Mise à jour…' : 'Choisir une image'}<input type="file" accept="image/png,image/jpeg" disabled={logoBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void logoAction(file); event.currentTarget.value = ''; }} /></label>
          {company.logoHash && <button className="text-button danger-button" disabled={logoBusy} onClick={() => void logoAction()}>Supprimer le logo</button>}</div>}
      </section>
      {!isAdmin && <div className="page-alert" role="status">Seul un administrateur peut modifier ces paramètres.</div>}
      <form className="company-form" onSubmit={submit} noValidate><fieldset disabled={!isAdmin || isSubmitting}>
        <section className="panel company-section"><h2>Coordonnées</h2><div className="company-fields"><Field label="Nom de l’entreprise" error={errors.name?.message} {...register('name')} /><Field label="Adresse e-mail" type="email" error={errors.email?.message} {...register('email')} />
          <Field label="Téléphone" type="tel" error={errors.phone?.message} {...register('phone')} /><Field label="Adresse postale" error={errors.address?.message} {...register('address')} /></div></section>
        <section className="panel company-section"><h2>Identifiants fiscaux</h2><KeyValueEditor rows={taxRows} onChange={updateTaxRows} keyLabel="Type (ex. IFU)" valueLabel="Numéro" />
          <button className="button-secondary" type="button" onClick={() => updateTaxRows([...taxRows, { key: '', value: '' }])}>＋ Ajouter un identifiant</button></section>
        <section className="panel company-section"><h2>Devise et fiscalité</h2><div className="company-fields company-fields-four"><Field label="Code devise" maxLength={3} error={errors.currency?.message} {...currencyField} onChange={(event) => { void currencyField.onChange(event); setValue('currency', event.target.value.toUpperCase(), { shouldValidate: true }); }} />
          <Field label="Décimales monétaires" type="number" min="0" max="6" error={errors.decimals?.message} {...register('decimals')} /><Field label="TVA par défaut (%)" inputMode="decimal" error={errors.defaultTaxPercent?.message} {...register('defaultTaxPercent')} />
          <Field label="Fuseau horaire" placeholder="Africa/Ouagadougou" error={errors.timezone?.message} {...register('timezone')} /></div></section>
        <section className="panel company-section"><h2>Numérotation et paiement</h2><div className="company-fields company-fields-four"><Field label="Préfixe devis" maxLength={12} error={errors.quotePrefix?.message} {...register('quotePrefix')} /><Field label="Préfixe facture" maxLength={12} error={errors.invoicePrefix?.message} {...register('invoicePrefix')} />
          <Field label="Délai de paiement (jours)" type="number" min="0" max="3650" error={errors.paymentDelayDays?.message} {...register('paymentDelayDays')} /></div>
          <label className="form-field"><span>Conditions de paiement</span><textarea rows={3} {...register('paymentTerms')} /></label>
          <h3>Coordonnées de règlement</h3><KeyValueEditor rows={paymentRows} onChange={updatePaymentRows} keyLabel="Type (banque, mobile money…)" valueLabel="Coordonnées" />
          <button className="button-secondary" type="button" onClick={() => updatePaymentRows([...paymentRows, { key: '', value: '' }])}>＋ Ajouter des coordonnées</button></section>
        <section className="panel company-section"><h2>Mentions des documents</h2><label className="form-field"><span>Mentions légales</span><textarea rows={4} {...register('legalMentions')} /></label><label className="form-field"><span>Pied de page PDF</span><textarea rows={3} {...register('footerText')} /></label></section>
      </fieldset>
      {isAdmin && <div className="company-savebar"><span>{isDirty || mapsDirty ? 'Modifications non enregistrées' : 'Paramètres enregistrés'}</span><button className="button-primary" disabled={isSubmitting || (!isDirty && !mapsDirty)}>{isSubmitting ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button></div>}
      </form>
    </>}
  </section>;
}

function Field({ label, error, ...props }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="form-field"><span>{label}</span><input {...props} aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label>;
}
function KeyValueEditor({ rows, onChange, keyLabel, valueLabel }: { rows: KeyValue[]; onChange: (rows: KeyValue[]) => void; keyLabel: string; valueLabel: string }) {
  return <div className="key-value-list">{rows.map((row, index) => <div className="key-value-row" key={`${index}-${row.key}`}>
    <label className="form-field"><span>{keyLabel}</span><input value={row.key} maxLength={80} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} /></label>
    <label className="form-field"><span>{valueLabel}</span><input value={row.value} maxLength={500} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} /></label>
    <button type="button" className="text-button danger-button" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label={`Supprimer ${keyLabel.toLowerCase()}`}>Retirer</button>
  </div>)}</div>;
}
