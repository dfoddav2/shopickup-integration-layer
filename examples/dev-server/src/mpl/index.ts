/**
 * MPL Routes - Main Export
 * Registers all MPL route handlers to Fastify instance
 */

import { FastifyInstance } from 'fastify';
import { MPLAdapter } from '@shopickup/adapters-mpl';
import type { CarrierAdapter } from '@shopickup/core';
import { withOperationName, withCallTracing, composeAdapterWrappers } from '@shopickup/core';
import { registerPickupPointsRoute } from './pickup-points.js';

/**
 * Register all MPL routes to the Fastify instance
 * 
 * Routes registered:
 * - POST /api/dev/mpl/pickup-points (fetch delivery places / pickup points)
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

  // Register individual route handlers
  await registerPickupPointsRoute(fastify, adapter);
}

// Export common utilities for tests or external use
export * from './common.js';
