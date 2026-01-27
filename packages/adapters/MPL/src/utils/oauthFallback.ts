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
 * Check if an error is an HttpError with 401 "Basic auth disabled" status
 */
function isBasicAuthDisabledHttpError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const errObj = err as any;
  
  // Check if it's an HTTP error with 401 status
  // HttpError has structure: { status?: number, response?: { data: unknown } }
  if (errObj.status === 401 && errObj.response?.data) {
    return isBasicAuthDisabledError(errObj.response.data);
  }
  
  return false;
}

/**
 * Create an HTTP client wrapper that automatically exchanges credentials
 * to OAuth2 Bearer token when Basic auth is disabled
 * 
 * @param baseHttpClient The underlying HTTP client to wrap
 * @param credentials API credentials (apiKey + apiSecret for Basic auth)
 * @param accountingCode Customer code from Magyar Posta
 * @param resolveOAuthUrl Function to resolve OAuth token endpoint URL (test vs. production)
 * @param logger Optional logger for debugging
 * @param useTestApi Optional flag to use sandbox/test API for OAuth token exchange (defaults to false/production)
 * @returns Wrapped HttpClient with OAuth fallback
 */
export function withOAuthFallback(
  baseHttpClient: HttpClient,
  credentials: Extract<MPLCredentials, { authType: 'apiKey' }>,
  accountingCode: string,
  resolveOAuthUrl: ResolveOAuthUrl,
  logger?: Logger,
  useTestApi: boolean = false
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
      logger?.info('[OAuth Fallback] Basic auth disabled detected, attempting to exchange credentials', { 
        url, 
        method,
        accountingCode: accountingCode.substring(0, 4) + '****' // mask for logging
      });

      // Exchange credentials for OAuth token (or use cached token)
      let oauthToken: string;

      if (cachedOAuthToken && cachedOAuthToken.issued_at) {
        // Check if token is still valid (with 30-second buffer)
        const expiresAt = cachedOAuthToken.issued_at + (cachedOAuthToken.expires_in * 1000) - 30000;
        if (Date.now() < expiresAt) {
          logger?.debug('[OAuth Fallback] Using cached OAuth token', {
            expiresInSeconds: cachedOAuthToken.expires_in,
            remainingMs: expiresAt - Date.now(),
          });
          oauthToken = cachedOAuthToken.access_token;
        } else {
           logger?.info('[OAuth Fallback] Cached OAuth token expired, exchanging for new one', {
             expiresInSeconds: cachedOAuthToken.expires_in,
           });
           // Token expired, exchange again
           const exchanged = await exchangeAuthToken(
             { credentials, options: { useTestApi } },
             { http: baseHttpClient, logger } as AdapterContext,
             resolveOAuthUrl,
             accountingCode
           );
          logger?.info('[OAuth Fallback] Successfully exchanged credentials for new OAuth token', {
            expiresInSeconds: exchanged.expires_in,
          });
          cachedOAuthToken = exchanged;
          oauthToken = exchanged.access_token;
        }
       } else {
         // No cached token, exchange now
         logger?.info('[OAuth Fallback] No cached token, exchanging API credentials for OAuth token');
         const exchanged = await exchangeAuthToken(
           { credentials, options: { useTestApi } },
           { http: baseHttpClient, logger } as AdapterContext,
           resolveOAuthUrl,
           accountingCode
         );
        logger?.info('[OAuth Fallback] Successfully exchanged credentials for OAuth token', {
          expiresInSeconds: exchanged.expires_in,
        });
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
         ...(config?.headers || {}),
         ...buildMPLHeaders(oauthCredentialsObj, accountingCode),
       };

      const newConfig: HttpClientConfig = {
        ...config,
        headers: newHeaders,
      };

      logger?.info('[OAuth Fallback] Retrying original request with OAuth Bearer token', { 
        url, 
        method 
      });

      // Retry the original request with new OAuth credentials
      const retryResponse = await baseHttpClient[method]<T>(url, data as any, newConfig);

      logger?.info('[OAuth Fallback] Request succeeded after OAuth fallback', { 
        url, 
        method, 
        status: retryResponse.status 
      });

      return retryResponse;
    } catch (err) {
      // OAuth exchange failed or retry failed
      // Fail-fast: don't retry again
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger?.error('[OAuth Fallback] OAuth fallback failed', { 
        url, 
        method, 
        error: errorMessage,
        errorType: err instanceof Error ? err.constructor.name : typeof err,
      });

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
      try {
        const response = await baseHttpClient.get<T>(url, config);

        // Check for "Basic auth disabled" error in successful response
        if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
          logger?.info('[OAuth Fallback] Intercepted 401 response (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('get', url, undefined, config);
        }

        return response;
      } catch (err) {
        // Check if error is a 401 "Basic auth disabled" error
        if (isBasicAuthDisabledHttpError(err)) {
          logger?.info('[OAuth Fallback] Intercepted 401 error (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('get', url, undefined, config);
        }
        
        // Re-throw other errors
        throw err;
      }
    },

    async post<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      try {
        const response = await baseHttpClient.post<T>(url, data, config);

        // Check for "Basic auth disabled" error in successful response
        if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
          logger?.info('[OAuth Fallback] Intercepted 401 response (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('post', url, data, config);
        }

        return response;
      } catch (err) {
        // Check if error is a 401 "Basic auth disabled" error
        if (isBasicAuthDisabledHttpError(err)) {
          logger?.info('[OAuth Fallback] Intercepted 401 error (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('post', url, data, config);
        }
        
        // Re-throw other errors
        throw err;
      }
    },

    async put<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      try {
        const response = await baseHttpClient.put<T>(url, data, config);

        // Check for "Basic auth disabled" error in successful response
        if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
          logger?.info('[OAuth Fallback] Intercepted 401 response (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('put', url, data, config);
        }

        return response;
      } catch (err) {
        // Check if error is a 401 "Basic auth disabled" error
        if (isBasicAuthDisabledHttpError(err)) {
          logger?.info('[OAuth Fallback] Intercepted 401 error (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('put', url, data, config);
        }
        
        // Re-throw other errors
        throw err;
      }
    },

    async patch<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      try {
        const response = await baseHttpClient.patch<T>(url, data, config);

        // Check for "Basic auth disabled" error in successful response
        if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
          logger?.info('[OAuth Fallback] Intercepted 401 response (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('patch', url, data, config);
        }

        return response;
      } catch (err) {
        // Check if error is a 401 "Basic auth disabled" error
        if (isBasicAuthDisabledHttpError(err)) {
          logger?.info('[OAuth Fallback] Intercepted 401 error (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('patch', url, data, config);
        }
        
        // Re-throw other errors
        throw err;
      }
    },

    async delete<T = unknown>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      try {
        const response = await baseHttpClient.delete<T>(url, config);

        // Check for "Basic auth disabled" error in successful response
        if (response.status === 401 && isBasicAuthDisabledError(response.body)) {
          logger?.info('[OAuth Fallback] Intercepted 401 response (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('delete', url, undefined, config);
        }

        return response;
      } catch (err) {
        // Check if error is a 401 "Basic auth disabled" error
        if (isBasicAuthDisabledHttpError(err)) {
          logger?.info('[OAuth Fallback] Intercepted 401 error (Basic auth disabled)', { url });
          return handleBasicAuthDisabled<T>('delete', url, undefined, config);
        }
        
        // Re-throw other errors
        throw err;
      }
    },
  };
}
