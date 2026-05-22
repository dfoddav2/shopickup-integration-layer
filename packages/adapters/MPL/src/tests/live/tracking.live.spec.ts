import { describe, expect, it } from 'vitest';
import { getMPLLiveConfig, exchangeMPLToken } from './live-env.js';

/**
 * MPL Sandbox Tracking — Hardcoded Mock IDs
 *
 * The MPL sandbox tracking endpoint (`/v2/nyomkovetes`) is backed by a
 * separate mock service that does NOT share data with the sandbox shipment
 * API. Parcels created via `createParcel` / `createLabel` / `closeShipments`
 * will NOT appear in tracking results.
 *
 * Only the following hardcoded identifiers return mock tracking data:
 *   - UA000449616US
 *   - PB2SW00021917
 *
 * This test verifies that the adapter correctly queries the tracking endpoint
 * and successfully parses the mock responses for known IDs.
 *
 * Reference: MPL tracking technical documentation — sandbox section.
 */
const MOCK_TRACKING_IDS = ['UA000449616US', 'PB2SW00021917'];

const live = await getMPLLiveConfig();

if (!live.enabled) {
  describe.skip('MPL live tracking (mock IDs)', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, baseUrl } = live;

  describe('MPL live tracking (mock IDs)', () => {
    it('tracks hardcoded sandbox mock identifiers', async () => {
      const accessToken = await exchangeMPLToken(live);
      const oauthCredentials = {
        authType: 'oauth2' as const,
        oAuth2Token: accessToken,
      };
      const useTestApi = baseUrl.includes('sandbox');

      for (const trackingNumber of MOCK_TRACKING_IDS) {
        console.log('MPL live tracking mock ID', { trackingNumber, useTestApi });

        const tracking = await adapter.track!(
          {
            trackingNumber,
            credentials: oauthCredentials,
            options: { useTestApi },
          },
          context,
        );

        console.log('MPL live tracking result', {
          trackingNumber: tracking.trackingNumber,
          status: tracking.status,
          events: tracking.events?.length,
        });

        expect(tracking.trackingNumber).toBe(trackingNumber);
        expect(tracking.status).toBeTruthy();
        expect(tracking.events).toBeDefined();
      }
    });
  });
}
