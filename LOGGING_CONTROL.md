# Logging Control for Adapters

## Overview

To prevent verbose logging of large carrier responses (like APM/pickup point lists with hundreds of entries), Shopickup provides a flexible logging control system. This document explains how to configure logging behavior in adapters.

## Problem

Adapters often fetch large datasets:
- **Pickup points**: Hundreds of APMs with full details
- **Tracking history**: Multiple events per shipment
- **Rates**: Extensive price matrices

Logging these complete responses pollutes logs and makes debugging harder.

## Solution: LoggingOptions

The `AdapterContext` now includes optional `LoggingOptions` to control what gets logged:

```typescript
interface LoggingOptions {
  // Max items to log in arrays (0 = skip entirely, Infinity = all)
  maxArrayItems?: number;

  // Max depth for nested objects (0 = type/count only)
  maxDepth?: number;

  // How to log raw responses:
  // false = skip, true = full, "summary" = summary only (default)
  logRawResponse?: boolean | "summary";

  // Include carrier-specific metadata in logs
  logMetadata?: boolean;

  // Operations to suppress logging for
  silentOperations?: string[];
}
```

## Usage Examples

### Example 1: Suppress Logging for Pickup Points

```typescript
const ctx: AdapterContext = {
  http: httpClient,
  logger: pino(),
  loggingOptions: {
    silentOperations: ['fetchPickupPoints'],
  },
};

const result = await adapter.fetchPickupPoints(req, ctx);
// Nothing will be logged
```

### Example 2: Log Summaries Instead of Full Responses

```typescript
const ctx: AdapterContext = {
  http: httpClient,
  logger: pino(),
  loggingOptions: {
    logRawResponse: 'summary',  // Log count + first 5 keys only
    maxArrayItems: 3,            // Show only first 3 items in arrays
    maxDepth: 1,                 // Don't log nested objects
  },
};

const result = await adapter.fetchPickupPoints(req, ctx);
// Logs: { count: 150, itemKeys: [5], itemCount: 5, ... }
```

### Example 3: Full Verbose Logging

```typescript
const ctx: AdapterContext = {
  http: httpClient,
  logger: pino(),
  loggingOptions: {
    logRawResponse: true,        // Log complete response
    maxArrayItems: Infinity,     // Log all items
    maxDepth: Infinity,          // Log all nesting levels
    logMetadata: true,           // Include metadata
  },
};

const result = await adapter.fetchPickupPoints(req, ctx);
// Full verbose logging
```

### Example 4: Environment-Based Configuration

```typescript
// In your gateway/server setup
function createAdapterContext(env: string): AdapterContext {
  const isProduction = env === 'production';
  
  return {
    http: httpClient,
    logger: pino(),
    loggingOptions: {
      // Be quiet in production, verbose in dev
      silentOperations: isProduction 
        ? ['fetchPickupPoints', 'track'] 
        : [],
      logRawResponse: isProduction ? 'summary' : true,
      maxArrayItems: isProduction ? 5 : Infinity,
    },
  };
}
```

## Safe Logging Utilities

Adapters should use the provided utilities to respect logging options:

### `safeLog()`

Logs data while respecting logging options:

```typescript
import { safeLog } from '@shopickup/core';

safeLog(
  ctx.logger,
  'info',
  'Fetched pickup points',
  { count: points.length, points },
  ctx,
  ['fetchPickupPoints']  // operations to consider as "silent" by default
);
```

### `createLogEntry()`

Creates a log-safe entry with summaries:

```typescript
import { createLogEntry } from '@shopickup/core';

const entry = createLogEntry(
  { operation: 'fetchPickupPoints', duration: 123 },
  response,
  ctx
);
// Returns: { operation, duration, responseCount: 150 }
```

### `truncateForLogging()`

Manually truncate objects before logging:

```typescript
import { truncateForLogging, getLoggingOptions } from '@shopickup/core';

const options = getLoggingOptions(ctx);
const truncated = truncateForLogging(largeResponse, options);
ctx.logger?.info('Response', truncated);
```

## Default Behavior

By default, `fetchPickupPoints` is in `silentOperations`:

```typescript
// Default: no logging for fetchPickupPoints
const result = await adapter.fetchPickupPoints(req, {
  http: httpClient,
  logger: pino(),
  // loggingOptions not provided = use defaults
});
// No logs will appear
```

To see logs, explicitly enable:

```typescript
const result = await adapter.fetchPickupPoints(req, {
  http: httpClient,
  logger: pino(),
  loggingOptions: {
    silentOperations: [],  // Enable logging
  },
});
```

## Adapter Implementation Guidance

When implementing a capability that returns large responses:

1. **Use `safeLog()`** instead of direct `logger.info()` calls:
   ```typescript
   // Good
   safeLog(ctx.logger, 'info', 'Fetched APMs', { count }, ctx, ['fetchPickupPoints']);

   // Avoid
   ctx.logger?.info('Fetched APMs', { rawResponse: allApmData });
   ```

2. **Mark large-response operations as silent by default**:
   ```typescript
   // In your capability implementation
   export async function fetchPickupPoints(req, ctx) {
     const opCtx = { ...ctx, operationName: 'fetchPickupPoints' };
     // Use opCtx for all logging calls
   }
   ```

3. **Preserve raw data for debugging**:
   ```typescript
   return {
     points: normalizedData,
     rawCarrierResponse: response,  // Always include, but log respects logRawResponse
   };
   ```

## Performance Considerations

- **No caching**: Logging is controlled per-call, not cached
- **Minimal overhead**: Safe logging only processes data if logger is present
- **Streaming support**: For very large responses, consider implementing pagination instead of logging everything

## Migration Guide

### From Old Logging

```typescript
// Old way (verbose)
ctx.logger?.info('Fetched', { response: allData });
```

### To New Logging

```typescript
// New way (safe)
import { safeLog } from '@shopickup/core';

safeLog(
  ctx.logger,
  'info',
  'Fetched',
  { count: allData.length },
  ctx,
  ['fetchPickupPoints']
);
```

## Troubleshooting

### I'm not seeing any logs for `fetchPickupPoints`

This is expected - it's in `silentOperations` by default. Enable with:

```typescript
loggingOptions: { silentOperations: [] }
```

### Logs are too verbose

Reduce verbosity:

```typescript
loggingOptions: {
  logRawResponse: 'summary',  // Instead of true
  maxArrayItems: 5,            // Limit array items
  maxDepth: 2,                 // Limit nesting
}
```

### I want to log everything for debugging

Use full verbosity:

```typescript
loggingOptions: {
  logRawResponse: true,
  maxArrayItems: Infinity,
  maxDepth: Infinity,
  logMetadata: true,
  silentOperations: [],
}
```

## API Reference

### `LoggingOptions` interface

See `packages/core/src/interfaces/adapter-context.ts`

### Safe logging functions

- `safeLog(logger, level, message, data, ctx, silentOps)` - Log with options applied
- `createLogEntry(baseInfo, response, ctx, silentOps)` - Create safe log entry
- `truncateForLogging(obj, options, depth)` - Truncate objects recursively
- `summarizeRawResponse(raw)` - Create summary of response
- `getLoggingOptions(ctx)` - Get merged options with defaults
- `isSilentOperation(ctx, defaultSilentOps)` - Check if operation should be silent

All exported from `@shopickup/core`.
