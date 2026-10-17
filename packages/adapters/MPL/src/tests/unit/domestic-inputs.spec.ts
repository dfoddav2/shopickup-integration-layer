import { describe, it, expect } from 'vitest';
import { normalizeMplPhone } from '../../phone.js';
import { mapAddress, mapContact, mapDeliveryAddress } from '../../mappers/shipment.js';

// Observations: MPL sandbox, 2026-10-17. The API only checks the phone's length (14)
// and wants a real four-digit Hungarian postal code.
describe('normalizeMplPhone', () => {
  it.each([
    ['+36 20 123 4567', '+36201234567'],
    ['+36-20-123-4567', '+36201234567'],
    ['(06) 20 123 4567', '+36201234567'],
    ['06201234567', '+36201234567'],
    ['0036 20 123 4567', '+36201234567'],
    ['+36201234567', '+36201234567'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeMplPhone(input)).toEqual({ ok: true, phone: expected });
  });

  it('refuses what is over 14 characters after compacting', () => {
    expect(normalizeMplPhone('+420 602 123 456 789')).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('mapContact phone', () => {
  const contact = { name: 'A', phone: '+36 20 123 4567' } as any;
  it('compacts', () => expect(mapContact(contact).phone).toBe('+36201234567'));
  it('throws when too long', () => {
    expect(() => mapContact({ name: 'A', phone: '+420602123456789' } as any)).toThrow(/at most 14/);
  });
});

describe('mapAddress postal code', () => {
  const base = { street: 'Fo utca 1', city: 'Budapest', country: 'HU' } as any;
  it('keeps a four-digit code', () => expect(mapAddress({ ...base, postalCode: ' 1011 ' }).postCode).toBe('1011'));
  it.each(['110 00', '81101', '101', 'ABCD', ''])('refuses "%s" instead of cutting or padding it', (zip) => {
    expect(() => mapAddress({ ...base, postalCode: zip })).toThrow(/four-digit/);
  });
});

describe('mapDeliveryAddress country', () => {
  const address = { street: 'Fo utca 1', city: 'Budapest', postalCode: '1011' };
  it('accepts HU', () => {
    expect(mapDeliveryAddress({ method: 'HOME', address: { ...address, country: 'hu' } } as any)).toBeTruthy();
  });
  it('refuses a missing country', () => {
    expect(() => mapDeliveryAddress({ method: 'HOME', address } as any)).toThrow(/country is missing/);
  });
  it('refuses a foreign country', () => {
    expect(() => mapDeliveryAddress({ method: 'HOME', address: { ...address, country: 'SK' } } as any)).toThrow(/Hungary only/);
  });
});
