/**
 * GLS Routes - Main Export
 * Registers all GLS route handlers to Fastify instance
 */

import { FastifyInstance } from 'fastify';
import { GLSAdapter } from '@shopickup/adapters-gls';
import { withOperationName, withCallTracing, composeAdapterWrappers, type CarrierAdapter } from '@shopickup/core';
import { registerPickupPointsRoute } from './pickup-points.js';

/**
 * Register all GLS routes to the Fastify instance
 *
 * Routes registered:
 * - GET /api/dev/gls/pickup-points?country=hu (fetch pickup points)
 *
 * The GLS adapter is wrapped with:
 * 1. withOperationName: automatically injects operation name into context
 * 2. withCallTracing: logs method timing information
 */
export async function registerGLSRoutes(fastify: FastifyInstance) {
  // Create base adapter
  const baseAdapter = new GLSAdapter();

  // Apply wrappers for cross-cutting concerns:
  // 1. withOperationName: automatically injects operation name into context
  // 2. withCallTracing: logs method timing information
  const adapter = composeAdapterWrappers(baseAdapter, [
    (a: CarrierAdapter) => withOperationName(a),
    (a: CarrierAdapter) => withCallTracing(a, fastify.log),
  ]);

  // Register route handlers
  await registerPickupPointsRoute(fastify, adapter as any);
}

// Export common utilities for tests or external use
export * from './common.js';
