import { createAxiosHttpClient } from '@shopickup/core';
import type { Logger } from '@shopickup/core';

// Factory to create a pre-configured HttpClient bound to a provided logger.
// Call this after Fastify is created so the client's debug logs route through Fastify's logger.
export function makeHttpClient(logger?: Logger) {
  return createAxiosHttpClient({
    defaultTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS) || 15000,
    debug: process.env.HTTP_DEBUG === '1',
    debugFullBody: process.env.HTTP_DEBUG_FULL === '1',
    logger,
  });
}
