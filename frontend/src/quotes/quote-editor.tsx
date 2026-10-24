import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '../api/http';
import { formatMinorUnits, minorUnitsToInput } from '../money/format';
import { QuoteDiscount, QuoteLineEditor } from './quote-line-editor';
import { calculateQuoteForm } from './quote-calculator';
import { blankQuoteLine, type ClientOption, type CompanyMoney, type ProductOption, type Quote, type QuoteFormValues } from './quote-model';
import { saveQuote } from './quote-api';
import { dateAfterDays } from './quote-date';
import { saveManualInvoice } from '../invoices/invoice-api';
import type { Invoice } from '../invoices/invoice-model';

const decimal = /^\d+(?:[.,]\d*)?$/;
const lineSchema = z.object({ productId: z.string(), description: z.string().trim().min(1, 'Ajoutez une désignation.').max(2_000),
  quantity: z.string().regex(/^\d+(?:[.,]\d{0,3})?$/, 'Quantité invalide (3 décimales maximum).'),
  unitPrice: z.string().regex(decimal, 'Prix invalide.'), taxRate: z.string().regex(decimal, 'Taux invalide.'),
  discountType: z.enum(['NONE', 'POURCENTAGE', 'MONTANT_FIXE']), discountValue: z.string() });
const formSchema = z.object({ clientId: z.string(), validUntil: z.string(), globalDiscountType: z.enum(['NONE', 'POURCENTAGE', 'MONTANT_FIXE']),
  globalDiscountValue: z.string(), lines: z.array(lineSchema).min(1, 'Ajoutez au moins une ligne.') });

function percentInput(basisPoints: string | number): string {
  const amount = BigInt(basisPoints); const fraction = (amount % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${amount / 100n}${fraction ? `.${fraction}` : ''}`;
}
function initialValues(quote?: Quote | Invoice, decimals = 0, defaultTaxRateBasisPts = 0, timezone = 'UTC'): QuoteFormValues {
  if (!quote) { const validUntil = dateAfterDays(timezone, 30);
    const line = blankQuoteLine(); line.taxRate = percentInput(defaultTaxRateBasisPts);
    return { clientId: '', validUntil, globalDiscountType: 'NONE', globalDiscountValue: '', lines: [line] }; }
  const asType = (value: string | null) => value === 'POURCENTAGE' || value === 'MONTANT_FIXE' ? value : 'NONE';
  const asDiscount = (type: string | null, value: string | null) => type === 'POURCENTAGE' ? percentInput(value ?? 0) : value ? minorUnitsToInput(value, decimals) : '';
  return { clientId: quote.clientId ?? '', validUntil: quote.validUntil?.slice(0, 10) ?? '', globalDiscountType: asType(quote.globalDiscountType),
    globalDiscountValue: asDiscount(quote.globalDiscountType, quote.globalDiscountValue), lines: quote.lines.map((line) => ({ productId: '', description: line.description,
      quantity: minorUnitsToInput(line.quantityMilli, 3), unitPrice: minorUnitsToInput(line.unitPrice, decimals), taxRate: percentInput(line.taxRateBasisPts),
      discountType: asType(line.discountType), discountValue: asDiscount(line.discountType, line.discountValue),
    })) };
}

export function QuoteEditor({ quote, invoice, kind = 'quote', onCancel, onSaved }: { quote?: Quote; invoice?: Invoice; kind?: 'quote' | 'invoice'; onCancel: () => void; onSaved: () => void }) {
  const document = quote ?? invoice;
  const [clients, setClients] = useState<ClientOption[]>([]); const [products, setProducts] = useState<ProductOption[]>([]);
  const [company, setCompany] = useState<CompanyMoney>({ currency: 'XOF', decimals: 0, defaultTaxRateBasisPts: 0 });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const { register, control, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<QuoteFormValues>({ resolver: zodResolver(formSchema), defaultValues: initialValues(document) });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  useEffect(() => { const controller = new AbortController();
    Promise.all([apiRequest<{ data: ClientOption[] }>('/clients?page=1&limit=100', { signal: controller.signal }),
      apiRequest<{ data: ProductOption[] }>('/products?page=1&limit=100', { signal: controller.signal }),
      apiRequest<CompanyMoney>('/company', { signal: controller.signal })])
      .then(([clientResult, productResult, settings]) => { setClients(clientResult.data); setProducts(productResult.data); setCompany(settings); reset(initialValues(document, settings.decimals, settings.defaultTaxRateBasisPts, settings.timezone)); })
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Impossible de charger les données du devis.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const values = watch();
  const calculation = useMemo(() => { try { return calculateQuoteForm(values, company.decimals); } catch { return null; } }, [values, company.decimals]);
  const submit = handleSubmit(async (formValues) => {
    setError('');
    try { const calculated = calculateQuoteForm(formValues, company.decimals);
      if (kind === 'invoice') await saveManualInvoice(calculated.payload, invoice);
      else await saveQuote(calculated.payload, quote);
      onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.'); }
  });
  const isQuote = kind === 'quote';
  return <section className="quote-editor"><header className="quote-editor-heading"><div><span className="eyebrow">{isQuote ? 'DEVIS' : 'FACTURE'} · {document ? 'BROUILLON' : 'NOUVEAU'}</span><h1>{document ? 'Modifier le brouillon' : `Créer un${isQuote ? '' : 'e'} ${isQuote ? 'devis' : 'facture'}`}</h1><p>Choisissez un client puis composez le document à partir de votre catalogue.</p></div>
    <button className="button-secondary" onClick={onCancel}>Retour</button></header>
    {error && <div className="page-alert" role="alert">{error}</div>}{loading ? <div className="panel empty-state" role="status">Chargement des clients et du catalogue…</div> : <form onSubmit={submit} noValidate>
      <div className="quote-editor-grid"><div className="quote-editor-main"><section className="panel quote-section"><h2>Informations du devis</h2><div className="form-columns">
        <label className="form-field"><span>Client</span><select {...register('clientId')}><option value="">Sélectionner un client…</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>{errors.clientId && <small className="field-error">{errors.clientId.message}</small>}</label>
        {isQuote && <label className="form-field"><span>Valide jusqu’au</span><input type="date" {...register('validUntil')} /></label>}</div></section>
        <section className="quote-section"><div className="quote-section-title"><h2>Lignes du devis</h2><button type="button" className="button-secondary" onClick={() => { const line = blankQuoteLine(); line.taxRate = percentInput(company.defaultTaxRateBasisPts); append(line); }}>＋ Ajouter une ligne</button></div>
          {fields.map((field, index) => { const lineErrors = errors.lines?.[index]; return <QuoteLineEditor key={field.id} index={index} register={register} setValue={setValue} products={products} company={company} computed={calculation?.totals.lines[index]} canRemove={fields.length > 1} onRemove={() => remove(index)} errors={{ description: lineErrors?.description?.message, quantity: lineErrors?.quantity?.message, unitPrice: lineErrors?.unitPrice?.message, taxRate: lineErrors?.taxRate?.message }} />; })}
        </section><section className="panel quote-section"><h2>Remise globale</h2><QuoteDiscount register={register} error={errors.globalDiscountValue} /></section>
      </div><aside className="panel quote-totals"><span className="eyebrow">RÉCAPITULATIF</span><h2>Totaux estimés</h2>
        <Total label="Sous-total HT" value={calculation?.totals.subtotalExcludingTax} company={company} />
        <Total label="Remise" value={calculation?.totals.globalDiscount} company={company} />
        <Total label="Total HT" value={calculation?.totals.totalExcludingTax} company={company} />
        {calculation?.totals.taxes.map((tax) => <Total key={tax.taxRateBasisPoints.toString()} label={`TVA ${(Number(tax.taxRateBasisPoints) / 100).toLocaleString('fr-FR')} %`} value={tax.tax} company={company} />)}
        <div className="quote-total-final"><span>Total TTC</span><strong>{calculation ? formatMinorUnits(calculation.totals.totalIncludingTax.toString(), company.currency, company.decimals) : '—'}</strong></div>
        {!calculation && <small className="field-error">Complétez les champs des lignes pour calculer les totaux.</small>}
        <button className="button-primary quote-save" disabled={isSubmitting || loading}>{isSubmitting ? 'Enregistrement…' : 'Enregistrer le brouillon'}</button>
      </aside></div></form>}
  </section>;
}

function Total({ label, value, company }: { label: string; value?: bigint; company: CompanyMoney }) {
  return <div className="quote-total-row"><span>{label}</span><strong>{value === undefined ? '—' : formatMinorUnits(value.toString(), company.currency, company.decimals)}</strong></div>;
}
