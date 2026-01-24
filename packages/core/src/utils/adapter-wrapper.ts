/**
 * Adapter Wrappers & Utilities
 * Higher-order functions for enhancing adapters with cross-cutting concerns
 */

import type { CarrierAdapter, AdapterContext } from '../interfaces/index.js';

/**
 * Operation name to method name mapping for CarrierAdapter
 * Defines which adapter method corresponds to which logical operation
 */
const DEFAULT_OPERATION_NAMES: Record<string, string> = {
  createParcel: 'createParcel',
  createParcels: 'createParcels',
  createLabel: 'createLabel',
  createLabels: 'createLabels',
  voidLabel: 'voidLabel',
  track: 'track',
  fetchPickupPoints: 'fetchPickupPoints',
  requestPickup: 'requestPickup',
  getRates: 'getRates',
};

/**
 * Create a proxy wrapper around a CarrierAdapter that automatically injects operationName
 * into the context for all adapter method calls.
 * 
 * This enables:
 * - Automatic operation identification for logging
 * - Per-operation logging control via loggingOptions.silentOperations
 * - Transparent operation tracking without adapter code changes
 * 
 * Usage:
 * ```typescript
 * const adapter = new FoxpostAdapter("https://api.foxpost.hu");
 * const wrappedAdapter = withOperationName(adapter);
 * 
 * const result = await wrappedAdapter.fetchPickupPoints(req, {
 *   http: client,
 *   logger: logger,
 *   loggingOptions: {
 *     silentOperations: ['fetchPickupPoints'],  // Suppress verbose logging
 *   }
 * });
 * ```
 * 
 * @param adapter The CarrierAdapter to wrap
 * @param operationNames Optional custom operation name mapping (defaults to method names)
 * @returns A wrapped adapter with automatic operation name injection
 */
export function withOperationName(
  adapter: CarrierAdapter,
  operationNames: Record<string, string> = DEFAULT_OPERATION_NAMES
): CarrierAdapter {
  return new Proxy(adapter, {
    get(target, methodName: string | symbol) {
      // Get the original method from the adapter
      const method = (target as any)[methodName];

      // If it's not a function or not a method we track, return as-is
      if (typeof method !== 'function' || !operationNames[methodName as string]) {
        return method;
      }

      const operationName = operationNames[methodName as string];

      // Return a wrapped function that injects operationName into context
      return function wrappedAdapterMethod(
        request: any,
        context: AdapterContext
      ): Promise<any> {
        // Create a new context with operationName set (allow override)
        const contextWithOperation: AdapterContext = {
          ...context,
          operationName: context.operationName || operationName,
        };

        // Call the original method with the enhanced context
        return (method as any).call(target, request, contextWithOperation);
      };
    },
  });
}

/**
 * Create a wrapper that logs all adapter method calls with timing information
 * Useful for monitoring adapter performance and debugging
 * 
 * Usage:
 * ```typescript
 * const adapter = new FoxpostAdapter("https://api.foxpost.hu");
 * const tracedAdapter = withCallTracing(adapter, logger);
 * 
 * // Now all calls are logged with timing:
 * // [trace] createLabel started
 * // [trace] createLabel completed in 145ms
 * ```
 * 
 * @param adapter The CarrierAdapter to wrap
 * @param logger Logger instance for tracing
 * @returns A wrapped adapter with call tracing
 */
export function withCallTracing(
  adapter: CarrierAdapter,
  logger?: any
): CarrierAdapter {
  return new Proxy(adapter, {
    get(target, methodName: string | symbol) {
      const method = (target as any)[methodName];

      if (typeof method !== 'function') {
        return method;
      }

      return async function tracedMethod(request: any, context: AdapterContext): Promise<any> {
        const startTime = Date.now();
        const opName = context.operationName || (methodName as string);

        try {
          logger?.debug(`[${adapter.id}] ${opName} started`, {
            method: methodName,
          });

          const result = await (method as any).call(target, request, context);

          const duration = Date.now() - startTime;
          logger?.info(`[${adapter.id}] ${opName} completed in ${duration}ms`, {
            method: methodName,
            duration,
            status: 'success',
          });

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          logger?.error(`[${adapter.id}] ${opName} failed after ${duration}ms`, {
            method: methodName,
            duration,
            error: (error as any)?.message,
          });

          throw error;
        }
      };
    },
  });
}

/**
 * Compose multiple adapter wrappers together
 * Allows layering multiple concerns (operation names, tracing, etc.)
 * 
 * Wrappers are applied left-to-right (first wrapper is innermost)
 * 
 * Usage:
 * ```typescript
 * const adapter = new FoxpostAdapter("https://api.foxpost.hu");
 * const enhanced = composeAdapterWrappers(adapter, [
 *   (a) => withOperationName(a),
 *   (a) => withCallTracing(a, logger),
 * ]);
 * ```
 * 
 * @param adapter The base adapter
 * @param wrappers Array of wrapper functions to apply
 * @returns The adapter with all wrappers applied
 */
export function composeAdapterWrappers(
  adapter: CarrierAdapter,
  wrappers: ((a: CarrierAdapter) => CarrierAdapter)[]
): CarrierAdapter {
  return wrappers.reduce((wrapped, wrapper) => wrapper(wrapped), adapter);
}
