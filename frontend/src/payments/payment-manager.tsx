import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { formatMinorUnits, parseMajorUnits } from '../money/format';
import { todayForTimezone } from '../quotes/quote-date';
import type { CompanyMoney } from '../quotes/quote-model';
import { cancelPayment, createPayment, getPayments, type Payment, type PaymentList, type PaymentMethod } from './payment-api';

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'VIREMENT', label: 'Virement bancaire' }, { value: 'MOBILE_MONEY', label: 'Mobile Money' }, { value: 'ESPECES', label: 'Espèces' },
  { value: 'CHEQUE', label: 'Chèque' }, { value: 'CARTE', label: 'Carte bancaire' }, { value: 'AUTRE', label: 'Autre' },
];
const methodNames = Object.fromEntries(methods.map((item) => [item.value, item.label])) as Record<PaymentMethod, string>;
const schema = z.object({ amount: z.string().regex(/^\d+(?:[.,]\d*)?$/, 'Saisissez un montant valide.'), paymentDate: z.string().date('Saisissez une date valide.'),
  method: z.enum(['VIREMENT', 'ESPECES', 'CHEQUE', 'MOBILE_MONEY', 'CARTE', 'AUTRE']), reference: z.string().max(250) });
type FormValues = z.infer<typeof schema>;

export function PaymentManager({ invoiceId, invoiceNumber, company, onClose, onChanged }: { invoiceId: string; invoiceNumber: string | null; company: CompanyMoney; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = useState<PaymentList | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [paymentKey, setPaymentKey] = useState<string | null>(null); const [cancelTarget, setCancelTarget] = useState<Payment | null>(null); const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { amount: '', paymentDate: todayForTimezone(company.timezone), method: 'VIREMENT', reference: '' } });
  const refresh = useCallback(async () => { setLoading(true); try { setList(await getPayments(invoiceId)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chargement des paiements impossible.'); } finally { setLoading(false); } }, [invoiceId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const openPaymentForm = () => { setPaymentKey(crypto.randomUUID()); reset({ amount: '', paymentDate: todayForTimezone(company.timezone), method: 'VIREMENT', reference: '' }); };
  const submit = handleSubmit(async (values) => {
    if (!paymentKey) return;
    setError('');
    try { const amount = parseMajorUnits(values.amount, company.decimals); if (BigInt(amount) <= 0n) throw new Error('Le montant doit être supérieur à zéro.');
      await createPayment(invoiceId, paymentKey, { ...values, amount, reference: values.reference || null }); setPaymentKey(null); reset(); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement du paiement impossible.'); }
  });
  const cancel = async () => {
    if (!cancelTarget || reason.trim().length < 3) return;
    setSaving(true); setError(''); try { await cancelPayment(invoiceId, cancelTarget.id, reason); setCancelTarget(null); setReason(''); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Annulation du paiement impossible.'); } finally { setSaving(false); }
  };
  return <div className="dialog-backdrop"><section className="resource-dialog payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
    <header><div><span className="eyebrow">SUIVI DES ENCAISSEMENTS</span><h2 id="payment-title">Facture {invoiceNumber ?? ''}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer">×</button></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {loading ? <p role="status">Chargement des paiements…</p> : list && <><div className="payment-summary">
      <Summary label="Montant TTC" value={list.summary.total} company={company} /><Summary label="Encaissé" value={list.summary.paid} company={company} /><Summary label="Solde" value={list.summary.balance} company={company} status={list.summary.status} />
    </div>
    <section className="payment-history"><div className="quote-section-title"><h3>Historique des paiements</h3><span>{list.data.length}</span></div>
      {list.data.length ? list.data.map((payment) => <article key={payment.id} className={`payment-item${payment.cancelledAt ? ' payment-cancelled' : ''}`}>
        <span><strong>{formatMinorUnits(payment.amount, company.currency, company.decimals)}</strong><small>{new Date(`${payment.paymentDate.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR')} · {methodNames[payment.method]}{payment.reference ? ` · ${payment.reference}` : ''}</small>
          {payment.cancelledAt && <small className="field-error">Annulé : {payment.cancellationReason}</small>}</span>
        {!payment.cancelledAt && <button className="text-button danger-button" onClick={() => setCancelTarget(payment)}>Annuler le paiement</button>}
      </article>) : <p className="accepted-empty">Aucun paiement enregistré.</p>}
    </section>
    {!paymentKey ? (list.summary.balance === '0'
      ? <p className="accepted-empty">La facture est intégralement réglée. Aucun paiement supplémentaire n'est possible.</p>
      : <button className="button-primary payment-add" onClick={openPaymentForm}>＋ Enregistrer un paiement</button>
    ) : <form className="resource-form payment-form" onSubmit={submit} noValidate>
      <h3>Nouveau paiement</h3><label className="form-field"><span>Montant ({company.currency})</span><input inputMode="decimal" {...register('amount')} aria-invalid={Boolean(errors.amount)} />{errors.amount && <small className="field-error">{errors.amount.message}</small>}</label>
      <div className="form-columns"><label className="form-field"><span>Date de paiement</span><input type="date" {...register('paymentDate')} aria-invalid={Boolean(errors.paymentDate)} />{errors.paymentDate && <small className="field-error">{errors.paymentDate.message}</small>}</label>
        <label className="form-field"><span>Mode de paiement</span><select {...register('method')}>{methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label></div>
      <label className="form-field"><span>Référence (facultatif)</span><input {...register('reference')} placeholder="N° transaction, chèque…" /></label>
      <p className="idempotency-note">La clé d’envoi est conservée pendant les nouvelles tentatives de ce formulaire.</p>
      <footer><button type="button" className="button-secondary" onClick={() => setPaymentKey(null)}>Annuler</button><button className="button-primary" disabled={isSubmitting}>{isSubmitting ? 'Enregistrement…' : 'Enregistrer le paiement'}</button></footer>
    </form>}</>}
    {cancelTarget && <div className="dialog-backdrop nested-dialog"><section className="resource-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-payment-title"><header><div><span className="eyebrow">TRAÇABILITÉ</span><h2 id="cancel-payment-title">Annuler le paiement</h2></div><button className="icon-button" onClick={() => setCancelTarget(null)} aria-label="Fermer">×</button></header>
      <p>{formatMinorUnits(cancelTarget.amount, company.currency, company.decimals)} sera exclu du solde encaissé. Le paiement sera conservé dans l’historique.</p><label className="form-field"><span>Motif (3 caractères minimum)</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
      <footer><button className="button-secondary" onClick={() => setCancelTarget(null)}>Retour</button><button className="button-primary" disabled={saving || reason.trim().length < 3} onClick={() => void cancel()}>{saving ? 'Annulation…' : 'Confirmer l’annulation'}</button></footer>
    </section></div>}
  </section></div>;
}

function Summary({ label, value, company, status }: { label: string; value: string; company: CompanyMoney; status?: string }) {
  return <article><span>{label}</span><strong>{formatMinorUnits(value, company.currency, company.decimals)}</strong>{status && <small>{({ PAYEE: 'Payée', PARTIELLEMENT_PAYEE: 'Partiellement payée', EN_RETARD: 'En retard', IMPAYEE: 'Impayée' } as Record<string, string>)[status]}</small>}</article>;
}
