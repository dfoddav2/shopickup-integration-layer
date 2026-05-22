import { describe, expect, it } from 'vitest';
import { getMPLLiveConfig } from './live-env.js';
import { exchangeAuthToken } from '../../capabilities/auth.js';
import { createResolveOAuthUrl } from '../../utils/resolveBaseUrl.js';
import type { ExchangeAuthTokenRequest } from '../../validation.js';

const live = await getMPLLiveConfig();

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
        },
      };

      const result = await exchangeAuthToken(
        req,
        live.context,
        createResolveOAuthUrl(
          'https://core.api.posta.hu/oauth2/token',
          'https://sandbox.api.posta.hu/oauth2/token',
        ),
        credentials.accountingCode,
      );

      console.log('MPL live auth token exchange result', {
        hasAccessToken: !!result.access_token,
        expiresIn: result.expires_in,
        tokenType: result.token_type,
      });

      expect(result.access_token).toBeTruthy();
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBeGreaterThan(0);
    });
  });
}
