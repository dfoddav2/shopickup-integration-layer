/**
 * Factory that creates a resolver function bound to production and test base URLs.
 * 
 * This removes duplication of base URL strings across capability files while keeping
 * per-call decision logic explicit and testable.
 * 
 * Usage:
 *   const resolveBaseUrl = createResolveBaseUrl(prodUrl, testUrl);
 *   const url = resolveBaseUrl(req.options); // returns test or prod based on useTestApi flag
 * 
 * @param prodBaseUrl Production API base URL
 * @param testBaseUrl Test/sandbox API base URL
 * @returns A pure resolver function that accepts request options and returns the appropriate URL
 */
export function createResolveBaseUrl(prodBaseUrl: string, testBaseUrl: string) {
  return (opts?: { useTestApi?: boolean }): string => {
    return opts?.useTestApi ? testBaseUrl : prodBaseUrl;
  };
}

/**
 * Factory that creates a resolver function for OAuth2 token endpoints.
 * 
 * MPL OAuth2 endpoints are separate from the main API:
 * - Production: https://core.api.posta.hu/oauth2/token
 * - Test/Sandbox: https://sandbox.api.posta.hu/oauth2/token
 * 
 * Usage:
 *   const resolveOAuthUrl = createResolveOAuthUrl(
 *     'https://core.api.posta.hu/oauth2/token',
 *     'https://sandbox.api.posta.hu/oauth2/token'
 *   );
 *   const url = resolveOAuthUrl(req.options); // returns test or prod endpoint
 * 
 * @param prodOAuthUrl Production OAuth2 token endpoint
 * @param testOAuthUrl Test/sandbox OAuth2 token endpoint
 * @returns A pure resolver function that accepts request options and returns the appropriate OAuth URL
 */
export function createResolveOAuthUrl(prodOAuthUrl: string, testOAuthUrl: string) {
  return (opts?: { useTestApi?: boolean }): string => {
    return opts?.useTestApi ? testOAuthUrl : prodOAuthUrl;
  };
}

/**
 * Type definition for the resolver function returned by createResolveBaseUrl.
 * Useful for typing capability function parameters.
 */
export type ResolveBaseUrl = ReturnType<typeof createResolveBaseUrl>;

/**
 * Type definition for the resolver function returned by createResolveOAuthUrl.
 * Useful for typing capability function parameters.
 */
export type ResolveOAuthUrl = ReturnType<typeof createResolveOAuthUrl>;

