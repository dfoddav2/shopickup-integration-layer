/**
 * MPL OAuth Token Exchange Capability
 * 
 * Exchanges Basic auth credentials (apiKey + apiSecret) for an OAuth2 Bearer token.
 * 
 * This capability allows integrators to:
 * 1. Proactively exchange credentials for OAuth tokens
 * 2. Cache tokens on their side (Redis, database, etc.)
 * 3. Pass OAuth tokens on subsequent API calls instead of Basic auth
 * 
 * Use cases:
 * - Integrator wants to avoid Basic auth if disabled at account level
 * - Integrator wants to cache tokens to reduce network calls
 * - Integrator wants to manage token lifecycle explicitly
 */

import type { AdapterContext } from "@shopickup/core";
import { CarrierError, safeLog, createLogEntry, serializeForLog } from "@shopickup/core";
import type { ResolveOAuthUrl } from "../utils/resolveBaseUrl.js";
import {
  safeValidateExchangeAuthTokenRequest,
  isGatewayError,
  type ExchangeAuthTokenRequest,
  type ExchangeAuthTokenResponse,
  type MPLOAuthTokenResponse,
  type MPLAPIGatewayErrorResponse,
} from "../validation.js";
import { buildMPLHeaders } from "../utils/httpUtils.js";

/**
 * Exchange Basic auth credentials for an OAuth2 Bearer token
 * 
 * POST to /oauth2/token with:
 * - Authorization: Basic <base64(apiKey:apiSecret)>
 * - Content-Type: application/x-www-form-urlencoded
 * - Body: grant_type=client_credentials
 * - X-Accounting-Code header (required by MPL)
 * - X-Request-ID header (for tracking)
 * 
 * Returns token with expiry information (typically 1 hour / 3600 seconds)
 * 
 * @param req Request with apiKey + apiSecret credentials
 * @param ctx Adapter context with HTTP client and logger
 * @param resolveOAuthUrl Function to resolve OAuth endpoint URL (test vs. production)
 * @param accountingCode Customer accounting code from MPL
 * @returns ExchangeAuthTokenResponse with access_token, expires_in, etc.
 * @throws CarrierError on invalid credentials or network failure
 */
export async function exchangeAuthToken(
  req: ExchangeAuthTokenRequest,
  ctx: AdapterContext,
  resolveOAuthUrl: ResolveOAuthUrl,
  accountingCode: string,
): Promise<ExchangeAuthTokenResponse> {
  if (!ctx.http) {
    throw new CarrierError(
      "HTTP client not provided in adapter context",
      "Permanent",
      { raw: "Missing ctx.http" }
    );
  }

   try {
     // Validate request format and credentials
     const validated = safeValidateExchangeAuthTokenRequest(req);
     if (!validated.success) {
       // Extract detailed error messages from Zod validation
       const errors = validated.error.issues.map((issue: any) => {
         const path = issue.path.length > 0 ? `${issue.path.join('.')}` : 'root';
         return `${path}: ${issue.message}`;
       }).join('; ');
       
       throw new CarrierError(
         `Invalid request: ${errors}`,
         "Validation",
         { raw: serializeForLog(validated.error) as unknown }
       );
     }

    // Only apiKey credentials can be exchanged
    if (validated.data.credentials.authType !== 'apiKey') {
      throw new CarrierError(
        "exchangeAuthToken requires apiKey credentials (apiKey + apiSecret), not oauth2 token",
        "Validation"
      );
    }

    const useTestApi = validated.data.options?.useTestApi ?? false;
    const oauthUrl = resolveOAuthUrl(validated.data.options);

    safeLog(
      ctx.logger,
      'debug',
      'Exchanging Basic auth credentials for OAuth token',
      createLogEntry(
        { useTestApi, endpoint: '/oauth2/token' },
        null,
        ctx,
        ['exchangeAuthToken']
      ),
      ctx,
      ['exchangeAuthToken']
    );

    // Make the OAuth token exchange request
    // Body: application/x-www-form-urlencoded with grant_type=client_credentials
    const httpResponse = await ctx.http.post<MPLOAuthTokenResponse>(
      oauthUrl,
      new URLSearchParams({
        grant_type: 'client_credentials',
      }).toString(),
      {
        headers: {
          ...buildMPLHeaders(validated.data.credentials, accountingCode),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    // Handle non-200 responses (auth failures)
    if (httpResponse.status !== 200) {
      const body = httpResponse.body;

      if (isGatewayError(body)) {
        const faultString = body.fault?.faultstring || 'Unknown error';
        const errorCode = body.fault?.detail?.errorcode || 'UNKNOWN';

        ctx.logger?.warn("OAuth token exchange failed", {
          status: httpResponse.status,
          errorCode,
          faultString,
        });

        throw new CarrierError(
          `OAuth token exchange failed: ${faultString} (${errorCode})`,
          "Auth",
          {
            carrierCode: errorCode,
            raw: body,
          }
        );
      } else {
        // Unexpected response format for error status
        throw new CarrierError(
          `OAuth token exchange returned status ${httpResponse.status} with unexpected response format`,
          "Transient",
          { raw: body }
        );
      }
    }

    // Validate 200 response structure
    const body = httpResponse.body;
    if (!body || typeof body !== 'object' || !('access_token' in body)) {
      throw new CarrierError(
        "Invalid OAuth token response: missing access_token",
        "Permanent",
        { raw: body }
      );
    }

    const tokenResponse = body as MPLOAuthTokenResponse;

    if (!tokenResponse.access_token || typeof tokenResponse.access_token !== 'string') {
      throw new CarrierError(
        "Invalid OAuth token response: access_token is not a string",
        "Permanent",
        { raw: tokenResponse }
      );
    }

    if (!tokenResponse.expires_in || typeof tokenResponse.expires_in !== 'number') {
      throw new CarrierError(
        "Invalid OAuth token response: expires_in is not a number",
        "Permanent",
        { raw: tokenResponse }
      );
    }

    const result: ExchangeAuthTokenResponse = {
      access_token: tokenResponse.access_token,
      token_type: tokenResponse.token_type || 'Bearer',
      expires_in: tokenResponse.expires_in,
      issued_at: tokenResponse.issued_at,
      raw: tokenResponse,
    };

    safeLog(
      ctx.logger,
      'info',
      'OAuth token exchanged successfully',
      {
        expiresIn: result.expires_in,
        tokenType: result.token_type,
        useTestApi,
      },
      ctx,
      ['exchangeAuthToken']
    );

    return result;
  } catch (err) {
    // Handle caught CarrierErrors
    if (err instanceof CarrierError) {
      throw err;
    }

    // Convert unknown errors to CarrierError
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger?.error("Failed to exchange OAuth token", {
      error: errorMessage,
      type: err instanceof Error ? err.constructor.name : typeof err,
    });

    throw new CarrierError(
      `Failed to exchange OAuth token: ${errorMessage}`,
      "Transient",
      { raw: err }
    );
  }
}
