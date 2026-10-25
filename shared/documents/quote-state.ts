export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'expired' | 'converted' | 'cancelled';

/**
 * Actions persistées. `expire` n’est plus une transition écrite (§7) :
 * l’affichage « expiré » se dérive de `sent` + date de validité dépassée.
 * Le statut `expired` reste dans le type pour les lectures legacy éventuelles.
 */
export type QuoteAction = 'delete' | 'send' | 'accept' | 'refuse' | 'convert' | 'cancel';

const transitions: Readonly<Record<QuoteStatus, ReadonlySet<QuoteAction>>> = {
  draft: new Set(['delete', 'send']),
  sent: new Set(['accept', 'refuse', 'cancel']),
  accepted: new Set(['convert', 'cancel']),
  refused: new Set(),
  expired: new Set(['refuse', 'cancel']),
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
  return ({ send: 'sent', accept: 'accepted', refuse: 'refused', convert: 'converted', cancel: 'cancelled' } as const)[action];
}
