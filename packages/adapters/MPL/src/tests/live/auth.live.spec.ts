import { describe, expect, it } from 'vitest';
import { getMPLLiveConfig } from './live-env.js';
import { exchangeAuthToken } from '../../capabilities/auth.js';
import { createResolveOAuthUrl } from '../../utils/resolveBaseUrl.js';
import type { ExchangeAuthTokenRequest } from '../../validation.js';

const live = getMPLLiveConfig();

if (!live.enabled) {
  describe.skip('MPL live auth flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { credentials, baseUrl } = live;

  describe('MPL live auth flow', () => {
    it('exchanges API credentials for an OAuth2 Bearer token', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
        },
        options: {
          useTestApi: baseUrl.includes('sandbox'),
          mpl: {
            accountingCode: credentials.accountingCode,
          },
        },
      };

      const result = await exchangeAuthToken(
        req,
        live.context,
        createResolveOAuthUrl(baseUrl),
      );

      console.log('MPL live auth token exchange result', {
        hasAccessToken: !!result.accessToken,
        expiresIn: result.expiresIn,
        tokenType: result.tokenType,
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBeGreaterThan(0);
    });
  });
}
