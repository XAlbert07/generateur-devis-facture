import { describe, expect, it } from 'vitest';
import { applyInvoiceAction, canApplyInvoiceAction } from './invoice-state.js';
import { applyQuoteAction, canApplyQuoteAction } from './quote-state.js';

describe('machine à états du devis', () => {
  it('autorise le parcours principal', () => {
    expect(applyQuoteAction('draft', 'send')).toBe('sent');
    expect(applyQuoteAction('sent', 'accept')).toBe('accepted');
    expect(applyQuoteAction('accepted', 'convert')).toBe('converted');
  });

  it('bloque une transition terminale', () => {
    expect(canApplyQuoteAction('converted', 'send')).toBe(false);
    expect(() => applyQuoteAction('refused', 'accept')).toThrow(RangeError);
    expect(applyQuoteAction('sent', 'expire')).toBe('expired');
    expect(canApplyQuoteAction('expired', 'accept')).toBe(false);
  });
});

describe('machine à états de la facture', () => {
  it('n’autorise l’émission que depuis le brouillon', () => {
    expect(applyInvoiceAction('draft', 'issue')).toBe('issued');
    expect(canApplyInvoiceAction('issued', 'issue')).toBe(false);
    expect(() => applyInvoiceAction('cancelled', 'cancel')).toThrow(RangeError);
  });
});
