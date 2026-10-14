import { describe, it, expect } from 'vitest';
import { FoxpostAdapter, FOXPOST_SUPPORTED_COUNTRIES } from '../../index.js';

describe('Foxpost supported countries', () => {
  it('is domestic-only', () => {
    expect([...FOXPOST_SUPPORTED_COUNTRIES]).toEqual(['HU']);
    expect(new FoxpostAdapter().supportedCountries).toEqual(['HU']);
  });
});
