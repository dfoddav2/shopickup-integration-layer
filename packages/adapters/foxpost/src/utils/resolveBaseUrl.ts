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
 * Type definition for the resolver function returned by createResolveBaseUrl.
 * Useful for typing capability function parameters.
 */
export type ResolveBaseUrl = ReturnType<typeof createResolveBaseUrl>;
