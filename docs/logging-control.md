# Logging Control

Shopickup logs should be concise, structured, and safe for an open-source package.

## Rules

- Log the operation, carrier, and key identifiers.
- Do not log credentials or full carrier payloads by default.
- Prefer summaries for large responses such as pickup-point feeds or tracking histories.
- Use `debug` for request details, `info` for successful lifecycle events, `warn` for recoverable issues, and `error` for failures.

## Default Behavior

- Large feeds should be silent or summary-only unless explicitly enabled.
- `fetchPickupPoints` is treated as a silent operation by default.

## Core Helpers

- `safeLog()`
- `createLogEntry()`
- `truncateForLogging()`
- `summarizeRawResponse()`
- `getLoggingOptions()`
- `isSilentOperation()`

## Good Log Shape

```ts
ctx.logger?.info("Label created", {
  carrierId,
  trackingNumber,
  parcelId,
});
```

## Avoid

- raw request/response dumps
- API keys, tokens, or secrets
- noisy logs for array-heavy carrier responses
