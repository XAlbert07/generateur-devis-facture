export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type InvoiceAction = 'delete' | 'issue' | 'cancel';

const transitions: Readonly<Record<InvoiceStatus, ReadonlySet<InvoiceAction>>> = {
  draft: new Set(['delete', 'issue']),
  issued: new Set(['cancel']),
  cancelled: new Set(),
};

export function canApplyInvoiceAction(status: InvoiceStatus, action: InvoiceAction): boolean {
  return transitions[status].has(action);
}

export function applyInvoiceAction(status: InvoiceStatus, action: InvoiceAction): InvoiceStatus | 'deleted' {
  if (!canApplyInvoiceAction(status, action)) {
    throw new RangeError(`Transition de facture interdite : ${status} -> ${action}`);
  }
  if (action === 'delete') return 'deleted';
  return action === 'issue' ? 'issued' : 'cancelled';
}
