import { describe, it, expect } from 'vitest';
import {
  GLS_SERVICE_CONSTRAINTS,
  isServiceAllowedForDelivery,
  homeDeliveryOnlyServiceCodes,
  pickupPointOnlyServiceCodes,
  explainServiceInapplicability,
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
});
