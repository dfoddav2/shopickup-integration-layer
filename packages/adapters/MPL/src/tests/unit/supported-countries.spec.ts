import { describe, it, expect } from 'vitest';
import { MPLAdapter, MPL_SUPPORTED_COUNTRIES } from '../../index.js';

describe('MPL supported countries', () => {
  it('is domestic-only', () => {
    expect([...MPL_SUPPORTED_COUNTRIES]).toEqual(['HU']);
    expect(new MPLAdapter().supportedCountries).toEqual(['HU']);
  });
});
