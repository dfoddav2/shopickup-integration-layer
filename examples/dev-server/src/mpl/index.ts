/**
 * MPL Routes - Main Export
 * Registers all MPL route handlers to Fastify instance
 */

import { FastifyInstance } from 'fastify';
import { MPLAdapter, createResolveBaseUrl, createResolveOAuthUrl } from '@shopickup/adapters-mpl';
import type { CarrierAdapter } from '@shopickup/core';
import { withOperationName, withCallTracing, composeAdapterWrappers } from '@shopickup/core';
import { registerPickupPointsRoute } from './pickup-points.js';
import { registerPickupPointsOAuthFallbackRoute } from './pickup-points-oauth-fallback.js';
import { registerExchangeAuthTokenRoute } from './auth.js';
import { registerCreateParcelRoute, registerCreateParcelsRoute } from './parcels.js';
import { registerCreateLabelRoute, registerCreateLabelsRoute } from './labels.js';

/**
 * Register all MPL routes to the Fastify instance
 * 
 * Routes registered:
 * - POST /api/dev/mpl/exchange-auth-token (exchange API credentials for OAuth token)
 * - POST /api/dev/mpl/pickup-points (fetch delivery places using direct credentials)
 * - POST /api/dev/mpl/pickup-points-oauth-fallback (fetch delivery places with automatic OAuth fallback)
 * - POST /api/dev/mpl/create-parcel (create a single parcel)
 * - POST /api/dev/mpl/create-parcels (create multiple parcels in batch)
 * - POST /api/dev/mpl/create-label (create label for single parcel)
 * - POST /api/dev/mpl/create-labels (create labels for multiple parcels in batch)
 * 
 * ### Adapter Wrappers
 * 
 * The adapter is wrapped with higher-order functions to add cross-cutting concerns:
 * 
 * ```typescript
 * // 1. Create base adapter
 * const baseAdapter = new MPLAdapter();
 * 
 * // 2. Wrap with operation name injection (enables per-operation logging control)
 * const withOps = withOperationName(baseAdapter);
 * 
 * // 3. Optionally add call tracing (logs timing info for monitoring)
 * const tracedAdapter = withCallTracing(withOps, fastify.log);
 * 
 * // Or use compose helper:
 * const adapter = composeAdapterWrappers(baseAdapter, [
 *   (a) => withOperationName(a),
 *   (a) => withCallTracing(a, fastify.log),
 * ]);
 * ```
 */
export async function registerMPLRoutes(fastify: FastifyInstance) {
  // Create base adapter
  const baseAdapter = new MPLAdapter();
  
  // Apply wrappers for cross-cutting concerns:
  // 1. withOperationName: automatically injects operation name into context
  // 2. withCallTracing: logs method timing information
  const adapter = composeAdapterWrappers(baseAdapter, [
    (a: CarrierAdapter) => withOperationName(a),
    (a: CarrierAdapter) => withCallTracing(a, fastify.log),
  ]);

  // Create resolver for API base URLs (production vs. test)
  const resolveBaseUrl = createResolveBaseUrl(
    'https://core.api.posta.hu/v2/mplapi',
    'https://sandbox.api.posta.hu/v2/mplapi'
  );

  // Create resolver for OAuth2 token endpoints (production vs. test)
  const resolveOAuthUrl = createResolveOAuthUrl(
    'https://core.api.posta.hu/oauth2/token',
    'https://sandbox.api.posta.hu/oauth2/token'
  );

  // Register individual route handlers
  await registerExchangeAuthTokenRoute(fastify, adapter as unknown as MPLAdapter);
  await registerPickupPointsRoute(fastify, adapter as unknown as MPLAdapter);
  await registerPickupPointsOAuthFallbackRoute(fastify, adapter as unknown as MPLAdapter, resolveBaseUrl, resolveOAuthUrl);
  await registerCreateParcelRoute(fastify, adapter as unknown as MPLAdapter);
  await registerCreateParcelsRoute(fastify, adapter as unknown as MPLAdapter);
  await registerCreateLabelRoute(fastify, adapter as unknown as MPLAdapter);
  await registerCreateLabelsRoute(fastify, adapter as unknown as MPLAdapter);
}

// Export common utilities for tests or external use
export * from './common.js';
