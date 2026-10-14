/**
 * Keeps the per-country CLI fixtures (examples/functions/fixtures/gls) valid:
 * each one must map through the GLS mapper for its own destination country.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapCanonicalParcelToGLS } from '../../mappers/parcels.js';
import { GLS_SUPPORTED_COUNTRIES } from '../../constants.js';

const fixtureDir = new URL('../../../../../../examples/functions/fixtures/gls/', import.meta.url);

function load(cc: string) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`create-parcel-${cc}.json`, fixtureDir)), 'utf8'));
}

const INTERNATIONAL = GLS_SUPPORTED_COUNTRIES.filter((c) => c !== 'HU');

describe('GLS per-country create-parcel fixtures', () => {
  it.each(INTERNATIONAL)('maps the %s fixture to a %s delivery address', (cc) => {
    const fixture = load(cc.toLowerCase());
    const result = mapCanonicalParcelToGLS(fixture.parcel, 12345, fixture.options.gls);
    expect(result.deliveryAddress.countryIsoCode).toBe(cc);
    expect(result.pickupAddress.countryIsoCode).toBe('HU');
    expect(fixture.options.country).toBe('HU');
  });
});
