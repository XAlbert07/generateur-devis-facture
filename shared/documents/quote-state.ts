export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'expired' | 'converted' | 'cancelled';
export type QuoteAction = 'delete' | 'send' | 'accept' | 'refuse' | 'expire' | 'convert' | 'cancel';

const transitions: Readonly<Record<QuoteStatus, ReadonlySet<QuoteAction>>> = {
  draft: new Set(['delete', 'send']),
  sent: new Set(['accept', 'refuse', 'expire', 'cancel']),
  accepted: new Set(['convert', 'cancel']),
  refused: new Set(),
  expired: new Set(),
  converted: new Set(),
  cancelled: new Set(),
};

/** Vérifie uniquement la transition d'état ; les préconditions vivent dans le service. */
export function canApplyQuoteAction(status: QuoteStatus, action: QuoteAction): boolean {
  return transitions[status].has(action);
}

export function applyQuoteAction(status: QuoteStatus, action: QuoteAction): QuoteStatus | 'deleted' {
  if (!canApplyQuoteAction(status, action)) {
    throw new RangeError(`Transition de devis interdite : ${status} -> ${action}`);
  }
  if (action === 'delete') return 'deleted';
  return ({ send: 'sent', accept: 'accepted', refuse: 'refused', expire: 'expired', convert: 'converted', cancel: 'cancelled' } as const)[action];
}
