import { describe, it, expect } from 'vitest';
import { normalizeFoxpostMobilePhone, explainFoxpostPhoneFailure, FOXPOST_MOBILE_PREFIXES } from '../../phone.js';
import { resolveFoxpostRecipient } from '../../mappers/index.js';
import { FOXPOST_PHONE_OBSERVATIONS } from '../fixtures/foxpost-phone-observations.js';

// Strings Foxpost refuses as written but that are only a different way of writing a valid
// number: the adapter normalises them to the compact form instead of failing.
const RECOVERABLE = new Set([
  'spaced +36 20 123 4567',
  'dashes +36-20-123-4567',
  '06 national',
  '06 national spaced',
  '0036',
  'bare 20...',
]);

describe('Foxpost recipient phone (replicates what its test API did on 2026-10-17)', () => {
  it('turns every recorded string into a number Foxpost accepted, or refuses it as Foxpost did', () => {
    const wrong = FOXPOST_PHONE_OBSERVATIONS.filter((o) => {
      const expectedOk = o.accepted || RECOVERABLE.has(o.note);
      return normalizeFoxpostMobilePhone(o.phone).ok !== expectedOk;
    }).map((o) => `${o.note} (${o.phone}): Foxpost ${o.accepted ? 'accepted' : 'refused'}`);
    expect(wrong).toEqual([]);
  });

  it('always sends the compact +36 form that Foxpost accepted', () => {
    for (const o of FOXPOST_PHONE_OBSERVATIONS) {
      const result = normalizeFoxpostMobilePhone(o.phone);
      if (result.ok) expect(result.e164).toMatch(/^\+36(?:20|30|31|50|70)\d{7}$/);
    }
  });

  it('does not accept prefix 51, which the adapter used to allow and Foxpost refuses', () => {
    expect([...FOXPOST_MOBILE_PREFIXES]).toEqual(['20', '30', '31', '50', '70']);
    expect(normalizeFoxpostMobilePhone('+36511234567')).toEqual({ ok: false, reason: 'not-mobile' });
  });

  it.each([
    ['+36 20 123 4567', '+36201234567'],
    ['06 30 123 4567', '+36301234567'],
    ['0036 70 123 4567', '+36701234567'],
    ['36201234567', '+36201234567'],
    ['(20) 123-4567', '+36201234567'],
  ])('normalises %s to %s', (input, e164) => {
    expect(normalizeFoxpostMobilePhone(input)).toEqual({ ok: true, e164 });
  });

  it('names the reason for a refusal', () => {
    expect(normalizeFoxpostMobilePhone('+420602123456')).toEqual({ ok: false, reason: 'other-country' });
    expect(normalizeFoxpostMobilePhone('+3612345678')).toEqual({ ok: false, reason: 'not-mobile' });
    expect(normalizeFoxpostMobilePhone('+36 20 abc')).toEqual({ ok: false, reason: 'invalid-characters' });
    expect(explainFoxpostPhoneFailure('+36 1 234', 'not-mobile')).toMatch(/Hungarian mobile number/);
  });
});

describe('Foxpost recipient (phone, postal code and country)', () => {
  const home = (over: { phone?: string; postalCode?: string; country?: string } = {}) =>
    ({
      id: 'p1',
      recipient: {
        contact: { name: 'Buyer', phone: over.phone ?? '06 20 123 4567', email: 'b@example.hu' },
        delivery: { method: 'HOME', address: { street: 'Fo utca 1', city: 'Budapest', postalCode: over.postalCode ?? '1011', country: over.country ?? 'HU' } },
      },
    }) as any;
  const pickup = (country?: string) =>
    ({
      id: 'p1',
      recipient: {
        contact: { name: 'Buyer', phone: '+36201234567' },
        delivery: { method: 'PICKUP_POINT', pickupPoint: { id: 'HU-APM1', ...(country ? { address: { country } } : {}) } },
      },
    }) as any;

  it('normalises the phone and keeps a valid four-digit zip', () => {
    expect(resolveFoxpostRecipient(home())).toEqual({ phone: '+36201234567', zip: '1011', country: 'HU' });
  });

  it.each(['110 00', '10110', '101', '1 011', 'ABCD', ''])('refuses the postal code %j, which Foxpost refuses', (postalCode) => {
    expect(() => resolveFoxpostRecipient(home({ postalCode }))).toThrow(/four-digit Hungarian postal code/);
  });

  it('fails for a missing country instead of assuming Hungary', () => {
    expect(() => resolveFoxpostRecipient(home({ country: '' }))).toThrow(/country is missing/);
  });

  it('refuses a country Foxpost does not ship to, which its server answers with HTTP 500', () => {
    expect(() => resolveFoxpostRecipient(home({ country: 'CZ', postalCode: '1011' }))).toThrow(/within Hungary only, not CZ/);
    expect(() => resolveFoxpostRecipient(pickup('CZ'))).toThrow(/within Hungary only, not CZ/);
  });

  it('takes a pickup point without a country as the Hungarian parcel machine it is', () => {
    expect(resolveFoxpostRecipient(pickup())).toEqual({ phone: '+36201234567', country: undefined });
  });

  it('refuses a phone Foxpost would refuse for the whole batch', () => {
    expect(() => resolveFoxpostRecipient(home({ phone: '+36 1 234 5678' }))).toThrow(/Hungarian mobile number/);
    expect(() => resolveFoxpostRecipient(home({ phone: '+420602123456' }))).toThrow(/another country/);
  });
});
