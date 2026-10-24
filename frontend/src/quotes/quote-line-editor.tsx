import type { UseFormRegister, UseFormSetValue, FieldError } from 'react-hook-form';
import type { ComputedLine } from '../../../shared/money/types.js';
import { formatMinorUnits, minorUnitsToInput } from '../money/format';
import type { CompanyMoney, ProductOption, QuoteFormValues } from './quote-model';

export function QuoteLineEditor({ index, register, setValue, products, company, computed, canRemove, onRemove, errors }: {
  index: number; register: UseFormRegister<QuoteFormValues>; setValue: UseFormSetValue<QuoteFormValues>;
  products: ProductOption[]; company: CompanyMoney; computed?: ComputedLine; canRemove: boolean; onRemove: () => void;
  errors?: { description?: string; quantity?: string; unitPrice?: string; taxRate?: string };
}) {
  const productField = register(`lines.${index}.productId`);
  return <article className="quote-line-card"><header><b>Ligne {index + 1}</b><strong>{computed ? formatMinorUnits(computed.net.toString(), company.currency, company.decimals) : '—'}</strong></header>
    <label className="form-field"><span>Reprendre du catalogue</span><select {...productField} onChange={(event) => {
      void productField.onChange(event);
      const product = products.find((item) => item.id === event.target.value);
      if (!product) return;
      setValue(`lines.${index}.description`, product.description ? `${product.name} — ${product.description}` : product.name, { shouldValidate: true });
      setValue(`lines.${index}.unitPrice`, minorUnitsToInput(product.unitPrice, company.decimals), { shouldValidate: true });
      setValue(`lines.${index}.taxRate`, (product.taxRateBasisPts / 100).toFixed(2).replace(/\.?0+$/, ''), { shouldValidate: true });
    }}><option value="">Choisir un produit ou service…</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="form-field"><span>Désignation</span><input {...register(`lines.${index}.description`)} placeholder="Description de la prestation" aria-invalid={Boolean(errors?.description)} />{errors?.description && <small className="field-error">{errors.description}</small>}</label>
    <div className="quote-line-fields"><label className="form-field"><span>Quantité</span><input inputMode="decimal" {...register(`lines.${index}.quantity`)} aria-invalid={Boolean(errors?.quantity)} />{errors?.quantity && <small className="field-error">{errors.quantity}</small>}</label>
      <label className="form-field"><span>Prix unitaire ({company.currency})</span><input inputMode="decimal" {...register(`lines.${index}.unitPrice`)} aria-invalid={Boolean(errors?.unitPrice)} />{errors?.unitPrice && <small className="field-error">{errors.unitPrice}</small>}</label>
      <label className="form-field"><span>Taxe (%)</span><input inputMode="decimal" {...register(`lines.${index}.taxRate`)} aria-invalid={Boolean(errors?.taxRate)} />{errors?.taxRate && <small className="field-error">{errors.taxRate}</small>}</label></div>
    <div className="quote-line-fields quote-discount-fields"><label className="form-field"><span>Remise</span><select {...register(`lines.${index}.discountType`)}><option value="NONE">Aucune</option><option value="POURCENTAGE">Pourcentage</option><option value="MONTANT_FIXE">Montant fixe</option></select></label>
      <label className="form-field"><span>Valeur de remise</span><input inputMode="decimal" {...register(`lines.${index}.discountValue`)} placeholder="0" /></label>
      {canRemove && <button className="text-button danger-button" type="button" onClick={onRemove}>Retirer la ligne</button>}</div>
    {!computed && !errors && <small className="field-error">Vérifiez la quantité, le prix, la taxe et la remise de cette ligne.</small>}
  </article>;
}

export function QuoteDiscount({ register, error }: { register: UseFormRegister<QuoteFormValues>; error?: FieldError }) {
  return <div className="quote-global-discount"><label className="form-field"><span>Remise globale</span><select {...register('globalDiscountType')}><option value="NONE">Aucune</option><option value="POURCENTAGE">Pourcentage</option><option value="MONTANT_FIXE">Montant fixe</option></select></label>
    <label className="form-field"><span>Valeur de remise</span><input inputMode="decimal" {...register('globalDiscountValue')} placeholder="0" aria-invalid={Boolean(error)} />{error && <small className="field-error">{error.message}</small>}</label></div>;
}
