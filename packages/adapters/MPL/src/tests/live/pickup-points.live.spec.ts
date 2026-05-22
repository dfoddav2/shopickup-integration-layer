import { describe, expect, it } from 'vitest';
import { getMPLLiveConfig, exchangeMPLToken } from './live-env.js';

const live = await getMPLLiveConfig();

if (!live.enabled) {
  describe.skip('MPL live pickup-points', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, baseUrl } = live;

  describe('MPL live pickup-points', () => {
    it('fetches pickup points using OAuth2 token', async () => {
      const accessToken = await exchangeMPLToken(live);
      console.log('MPL live auth token obtained', { hasToken: !!accessToken });

      const result = await adapter.fetchPickupPoints!(
        {
          credentials: {
            authType: 'oauth2',
            oAuth2Token: accessToken,
          },
          options: {
            useTestApi: baseUrl.includes('sandbox'),
            mpl: {
              accountingCode: credentials.accountingCode,
              postCode: '1123',
              city: 'Budapest',
              servicePointType: ['CS', 'PP'],
            },
          },
        },
        context,
      );

      console.log('MPL live pickup points result', {
        count: result.points.length,
        firstPoint: result.points[0],
      });

      expect(Array.isArray(result.points)).toBe(true);
      expect(result.points.length).toBeGreaterThan(0);

      const first = result.points[0];
      expect(first.id).toBeTruthy();
      expect(first.name).toBeTruthy();
    });
  });
}
