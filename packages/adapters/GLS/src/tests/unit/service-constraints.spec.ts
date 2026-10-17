import { describe, it, expect } from 'vitest';
import {
  GLS_SERVICE_CONSTRAINTS,
  isServiceAllowedForDelivery,
  homeDeliveryOnlyServiceCodes,
  pickupPointOnlyServiceCodes,
  explainServiceInapplicability,
  isServiceAvailableForCountry,
} from '../../service-constraints.js';

describe('GLS service constraints', () => {
  it('marks FDS, FSS and CS1 as home-delivery only', () => {
    expect(homeDeliveryOnlyServiceCodes().sort()).toEqual(['CS1', 'FDS', 'FSS']);
  });

  it('marks PSD as pickup-point only', () => {
    expect(pickupPointOnlyServiceCodes()).toEqual(['PSD']);
  });

  it('records the documented FSS -> FDS prerequisite', () => {
    expect(GLS_SERVICE_CONSTRAINTS.FSS.requires).toEqual(['FDS']);
  });

  it('allows home-delivery services for HOME and rejects them for PICKUP_POINT', () => {
    for (const code of ['FDS', 'FSS', 'CS1']) {
      expect(isServiceAllowedForDelivery(code, 'HOME')).toBe(true);
      expect(isServiceAllowedForDelivery(code, 'PICKUP_POINT')).toBe(false);
    }
  });

  it('leaves unverified services permissive until GLS confirms them', () => {
    // Deliberately permissive: the MyGLS API docs do not state a
    // delivery-method constraint for these, and guessing would drop
    // services that work today.
    for (const code of ['SM2', '24H', 'SAT', 'T09']) {
      expect(isServiceAllowedForDelivery(code, 'HOME')).toBe(true);
      expect(isServiceAllowedForDelivery(code, 'PICKUP_POINT')).toBe(true);
    }
  });

  it('permits service codes it does not know about', () => {
    expect(isServiceAllowedForDelivery('XYZ', 'PICKUP_POINT')).toBe(true);
  });

  it('explains an inapplicable service and stays silent about an applicable one', () => {
    expect(explainServiceInapplicability('FDS', 'PICKUP_POINT')).toMatch(
      /not available for PICKUP_POINT/
    );
    expect(explainServiceInapplicability('FDS', 'HOME')).toBeNull();
  });

  describe('destination countries (verified on the GLS test API, 2026-10-17)', () => {
    const ALL = ['HU', 'CZ', 'SK', 'HR', 'RO', 'SI', 'RS'];
    const availableIn = (code: string) => ALL.filter((c) => isServiceAvailableForCountry(code, c));

    it('offers FDS and FSS everywhere except RS', () => {
      expect(availableIn('FDS')).toEqual(['HU', 'CZ', 'SK', 'HR', 'RO', 'SI']);
      expect(availableIn('FSS')).toEqual(availableIn('FDS'));
    });

    it('offers SM2, 24H and CS1 only for HU and SK', () => {
      for (const code of ['SM2', '24H', 'CS1']) expect(availableIn(code)).toEqual(['HU', 'SK']);
    });

    it('offers SRS only for HU, although the documentation also names SI', () => {
      expect(availableIn('SRS')).toEqual(['HU']);
      expect(GLS_SERVICE_CONSTRAINTS.SRS.note).toMatch(/documentation says HU and SI/);
    });

    it('does not restrict a service that has no verified list, nor an unknown code', () => {
      expect(availableIn('SAT')).toEqual(ALL);
      expect(isServiceAvailableForCountry('XYZ', 'RS')).toBe(true);
    });

    it('matches the country case-insensitively', () => {
      expect(isServiceAvailableForCountry('SM2', 'sk')).toBe(true);
    });

    it('keeps the delivery-method answer unchanged when no country is given', () => {
      expect(isServiceAllowedForDelivery('SM2', 'HOME')).toBe(true);
      expect(isServiceAllowedForDelivery('SM2', 'HOME', 'CZ')).toBe(false);
      expect(isServiceAllowedForDelivery('FDS', 'PICKUP_POINT', 'HU')).toBe(false);
    });

    it('explains a country restriction and a delivery-method restriction differently', () => {
      expect(explainServiceInapplicability('SM2', 'HOME', 'CZ')).toMatch(/not available for destination CZ/);
      expect(explainServiceInapplicability('FDS', 'PICKUP_POINT', 'HU')).toMatch(/not available for PICKUP_POINT delivery/);
      expect(explainServiceInapplicability('SM2', 'HOME', 'SK')).toBeNull();
    });

    it('only lists countries the adapter supports', () => {
      for (const constraint of Object.values(GLS_SERVICE_CONSTRAINTS)) {
        for (const c of constraint.countries ?? []) expect(ALL).toContain(c);
      }
    });
  });
});
