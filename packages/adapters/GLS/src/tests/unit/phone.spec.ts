import { describe, it, expect } from 'vitest';
import {
  GLS_PHONE_RULES,
  normalizeGLSMobilePhone,
  normalizeGLSPhoneLoosely,
  explainGLSPhoneFailure,
} from '../../phone.js';
import {
  GLS_PSD_PHONE_OBSERVATIONS,
  GLS_PSD_PHONE_KNOWN_DIVERGENCES,
} from '../fixtures/gls-phone-observations.js';

describe('GLS phone numbers (replicates what the GLS test API did on 2026-10-17)', () => {
  it('agrees with every recorded GLS answer for a pickup-point ContactPhone', () => {
    const disagreements = GLS_PSD_PHONE_OBSERVATIONS.filter(
      (o) => normalizeGLSMobilePhone(o.phone, o.country).ok !== o.accepted
    ).map((o) => `${o.country} ${o.phone} (${o.note}): GLS ${o.accepted ? 'accepted' : 'refused'}`);
    expect(disagreements).toEqual([]);
  });

  it('is stricter than GLS only where it is documented to be', () => {
    for (const o of GLS_PSD_PHONE_KNOWN_DIVERGENCES) {
      expect(o.accepted).toBe(true);
      expect(normalizeGLSMobilePhone(o.phone, o.country).ok).toBe(false);
    }
  });

  describe('normalisation to E.164', () => {
    const cases: [string, string, string][] = [
      ['CZ', '+420 602 123 456', '+420602123456'],
      ['CZ', '00420602123456', '+420602123456'],
      ['CZ', '420602123456', '+420602123456'],
      ['CZ', '602 123 456', '+420602123456'],
      ['SK', '0905 123 456', '+421905123456'],
      ['SK', '905123456', '+421905123456'],
      ['HR', '091 123 4567', '+385911234567'],
      ['RO', '0712 345 678', '+40712345678'],
      ['SI', '041 123 456', '+38641123456'],
      ['HU', '06 20 123 4567', '+36201234567'],
      ['HU', '+36 (20) 123-4567', '+36201234567'],
      ['HU', '20 123 4567', '+36201234567'],
    ];
    it.each(cases)('%s %s -> %s', (country, input, e164) => {
      expect(normalizeGLSMobilePhone(input, country)).toEqual({ ok: true, e164 });
    });
  });

  describe('refusals', () => {
    it('refuses the trunk zero after the country code', () => {
      expect(normalizeGLSMobilePhone('+4210905123456', 'SK')).toEqual({ ok: false, reason: 'not-mobile' });
      expect(normalizeGLSMobilePhone('+36 06 20 123 4567', 'HU').ok).toBe(false);
    });

    it('refuses another country, naming the reason', () => {
      expect(normalizeGLSMobilePhone('+43 664 123456', 'CZ')).toEqual({ ok: false, reason: 'other-country' });
      expect(normalizeGLSMobilePhone('0043664123456', 'HR')).toEqual({ ok: false, reason: 'other-country' });
    });

    it('refuses landlines, empty values, letters and implausible numbers', () => {
      expect(normalizeGLSMobilePhone('+420 221 234 567', 'CZ').ok).toBe(false); // Prague landline
      expect(normalizeGLSMobilePhone('+36 1 234 5678', 'HU').ok).toBe(false); // Budapest landline
      expect(normalizeGLSMobilePhone('', 'CZ')).toEqual({ ok: false, reason: 'invalid-characters' });
      expect(normalizeGLSMobilePhone('+420 602 abc', 'CZ')).toEqual({ ok: false, reason: 'invalid-characters' });
      expect(normalizeGLSMobilePhone('+420000000', 'CZ').ok).toBe(false);
    });

    it('has no rule for a country outside the supported destinations', () => {
      expect(normalizeGLSMobilePhone('+43 664 123456', 'AT')).toEqual({ ok: false, reason: 'unsupported-country' });
    });
  });

  it('only normalises, never refuses, for the parameters GLS does not validate', () => {
    expect(normalizeGLSPhoneLoosely('0905 123 456', 'SK')).toBe('+421905123456');
    expect(normalizeGLSPhoneLoosely('+421 2 5470 2523', 'SK')).toBe('+421 2 5470 2523'); // landline, unchanged
    expect(normalizeGLSPhoneLoosely('call me', 'SK')).toBe('call me');
  });

  it('explains each refusal in words a merchant can act on', () => {
    expect(explainGLSPhoneFailure('+43 1', 'CZ', 'other-country')).toMatch(/does not match destination country CZ/);
    expect(explainGLSPhoneFailure('221 234 567', 'CZ', 'not-mobile')).toMatch(/mobile number.*landlines are refused/);
  });

  it('has a rule for every destination the adapter supports', () => {
    expect(Object.keys(GLS_PHONE_RULES).sort()).toEqual(['CZ', 'HR', 'HU', 'RO', 'RS', 'SI', 'SK']);
  });
});
