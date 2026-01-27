/**
 * OAuth Fallback HTTP Client Wrapper
 * 
 * Wraps an HTTP client to automatically handle the case where Basic auth is disabled
 * at the MPL account level. When a 401 is received with the "Basic auth not enabled" error,
 * this wrapper:
 * 
 * 1. Exchanges API credentials for an OAuth2 Bearer token
 * 2. Retries the original request with the new Bearer token
 * 3. Returns the retried response
 * 
 * This allows integrators to use Basic auth normally, but automatically falls back
 * to OAuth when Basic auth is not available, without modifying adapter code.
 * 
 * Pattern:
 * ```typescript
 * const baseHttpClient = createAxiosHttpClient();
 * const wrappedHttpClient = withOAuthFallback(
 *   baseHttpClient,
 *   credentials,
 *   accountingCode,
 *   resolveOAuthUrl,
 *   logger
 * );
 * // Now calls to wrappedHttpClient.post(...) handle OAuth fallback automatically
 * ```
 */

import type { HttpClient, HttpClientConfig, HttpResponse } from "@shopickup/core";
import { CarrierError } from "@shopickup/core";
import type { Logger, AdapterContext } from "@shopickup/core";
import type { MPLCredentials, ExchangeAuthTokenResponse } from "../validation.js";
import { exchangeAuthToken } from "../capabilities/auth.js";
import { isBasicAuthDisabledError, buildMPLHeaders } from "./httpUtils.js";
import type { ResolveOAuthUrl } from "./resolveBaseUrl.js";

/**
 * Create an HTTP client wrapper that automatically exchanges credentials
 * to OAuth2 Bearer token when Basic auth is disabled
 * 
 * @param baseHttpClient The underlying HTTP client to wrap
 * @param credentials API credentials (apiKey + apiSecret for Basic auth)
 * @param accountingCode Customer code from Magyar Posta
 * @param resolveOAuthUrl Function to resolve OAuth token endpoint URL (test vs. production)
 * @param logger Optional logger for debugging
 * @returns Wrapped HttpClient with OAuth fallback
 */
export function withOAuthFallback(
  baseHttpClient: HttpClient,
  credentials: Extract<MPLCredentials, { authType: 'apiKey' }>,
  accountingCode: string,
  resolveOAuthUrl: ResolveOAuthUrl,
  logger?: Logger
): HttpClient {
  let cachedOAuthToken: ExchangeAuthTokenResponse | null = null;

  /**
   * Internal helper to handle 401 "Basic auth disabled" error
   * Exchanges credentials for OAuth token and retries the request
   */
  async function handleBasicAuthDisabled<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
    data?: unknown,
    config?: HttpClientConfig
  ): Promise<HttpResponse<T>> {
    try {
      logger?.debug('Basic auth disabled, attempting OAuth token exchange', { url, method });

      // Exchange credentials for OAuth token (or use cached token)
      let oauthToken: string;

      if (cachedOAuthToken && cachedOAuthToken.issued_at) {
        // Check if token is still valid (with 30-second buffer)
        const expiresAt = cachedOAuthToken.issued_at + (cachedOAuthToken.expires_in * 1000) - 30000;
        if (Date.now() < expiresAt) {
          logger?.debug('Using cached OAuth token', {
            expiresIn: cachedOAuthToken.expires_in,
            remainingMs: expiresAt - Date.now(),
          });
          oauthToken = cachedOAuthToken.access_token;
        } else {
          logger?.debug('Cached OAuth token expired, exchanging for new one');
          // Token expired, exchange again
          const exchanged = await exchangeAuthToken(
            { credentials, options: {} },
            { http: baseHttpClient, logger } as AdapterContext,
            resolveOAuthUrl,
            accountingCode
          );
          cachedOAuthToken = exchanged;
          oauthToken = exchanged.access_token;
        }
      } else {
        // No cached token, exchange now
        const exchanged = await exchangeAuthToken(
          { credentials, options: {} },
          { http: baseHttpClient, logger } as AdapterContext,
          resolveOAuthUrl,
          accountingCode
        );
        cachedOAuthToken = exchanged;
        oauthToken = exchanged.access_token;
      }

      // Build new headers with OAuth token using object literal with 'any' type
      // to work around TypeScript's discriminated union inference issue
      const oauthCredentialsObj: any = {
        authType: 'oauth2',
        oAuth2Token: oauthToken,
      };

      const newHeaders = {
        ...buildMPLHeaders(oauthCredentialsObj, accountingCode),
        ...(config?.headers || {}),
      };

      const newConfig: HttpClientConfig = {
        ...config,
        headers: newHeaders,
      };

      logger?.debug('Retrying request with OAuth token', { url, method });

      // Retry the original request with new OAuth credentials
      const retryResponse = await baseHttpClient[method]<T>(url, data as any, newConfig);

      logger?.info('Request succeeded after OAuth fallback', { url, method, status: retryResponse.status });

      return retryResponse;
    } catch (err) {
      // OAuth exchange failed or retry failed
      // Fail-fast: don't retry again
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger?.error('OAuth fallback failed', { url, method, error: errorMessage });

      if (err instanceof CarrierError) {
        throw err;
      }

      throw new CarrierError(
        `OAuth fallback failed: ${errorMessage}`,
        'Transient',
        { raw: err }
      );
    }
  }

  return {
    async get<T = unknown>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      const response = await baseHttpClient.get<T>(url, config);

      // Check for "Basic auth disabled" error
      if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
        return handleBasicAuthDisabled<T>('get', url, undefined, config);
      }

      return response;
    },

    async post<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      const response = await baseHttpClient.post<T>(url, data, config);

      // Check for "Basic auth disabled" error
      if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
        return handleBasicAuthDisabled<T>('post', url, data, config);
      }

      return response;
    },

    async put<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      const response = await baseHttpClient.put<T>(url, data, config);

      // Check for "Basic auth disabled" error
      if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
        return handleBasicAuthDisabled<T>('put', url, data, config);
      }

      return response;
    },

    async patch<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      const response = await baseHttpClient.patch<T>(url, data, config);

      // Check for "Basic auth disabled" error
      if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
        return handleBasicAuthDisabled<T>('patch', url, data, config);
      }

      return response;
    },

    async delete<T = unknown>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      const response = await baseHttpClient.delete<T>(url, config);

      // Check for "Basic auth disabled" error
      if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
        return handleBasicAuthDisabled<T>('delete', url, undefined, config);
      }

      return response;
    },
  };
}
