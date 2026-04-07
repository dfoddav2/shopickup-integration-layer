// Import the small logger/http helpers from dev-server. Use the .ts source so
// ts-node can import it directly.
// Relative path to dev-server's http-client from repo root
import { wrapPinoLogger } from './logger.ts';
import { serializeForLog } from './serialize.ts';
import { createMockHttpClient } from './mockHttpClient.js';
import { createAxiosHttpClient, safeLog, getLoggingOptions } from '@shopickup/core';
import type { AdapterContext } from '@shopickup/core';
// Fastify types are optional for the examples harness; accept any logger shape
type FastifyLoggerInstance = any;

export function buildAdapterContext(httpClient: any, logger: FastifyLoggerInstance, operationName = 'examples-cli'): AdapterContext {
  // Create the context object first so logger callbacks can reference it
  const ctx: Partial<AdapterContext> = {
    http: httpClient,
    operationName,
    loggingOptions: { maxArrayItems: 5, maxDepth: 2, logRawResponse: 'summary' },
  };

  // If core.safeLog is available, use it to honor loggingOptions / truncation
  const baseLogger = logger || console;

  const boundLogger = {
    debug: (message: string, meta?: Record<string, unknown>) => {
      try {
        // safeLog will apply truncation/summarization according to ctx.loggingOptions
        (safeLog as any)(baseLogger, 'debug', message, (meta as any) || {}, ctx as AdapterContext);
      } catch (err) {
        // Fallback: simple serialize and forward
        const processed = meta ? serializeForLog(meta) : undefined;
        if (baseLogger?.debug) baseLogger.debug({ msg: message, ...(processed as any) });
        else console.debug(message, processed);
      }
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      try {
        (safeLog as any)(baseLogger, 'info', message, (meta as any) || {}, ctx as AdapterContext);
      } catch (err) {
        const processed = meta ? serializeForLog(meta) : undefined;
        if (baseLogger?.info) baseLogger.info({ msg: message, ...(processed as any) });
        else console.info(message, processed);
      }
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      try {
        (safeLog as any)(baseLogger, 'warn', message, (meta as any) || {}, ctx as AdapterContext);
      } catch (err) {
        const processed = meta ? serializeForLog(meta) : undefined;
        if (baseLogger?.warn) baseLogger.warn({ msg: message, ...(processed as any) });
        else console.warn(message, processed);
      }
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      try {
        (safeLog as any)(baseLogger, 'error', message, (meta as any) || {}, ctx as AdapterContext);
      } catch (err) {
        const processed = meta ? serializeForLog(meta) : undefined;
        if (baseLogger?.error) baseLogger.error({ msg: message, ...(processed as any) });
        else console.error(message, processed);
      }
    },
  } as AdapterContext['logger'];

  ctx.logger = boundLogger as any;

  return ctx as AdapterContext;
}

export function createHttpClient(opts?: { useMock?: boolean; debug?: boolean }) {
  const useMock = opts?.useMock ?? (process.env.USE_MOCK_HTTP_CLIENT === '1' || process.env.USE_MOCK_HTTP_CLIENT === 'true');
  if (useMock) {
    return createMockHttpClient();
  }

  const debug = opts?.debug ?? (process.env.HTTP_DEBUG === '1' || process.env.FULL_LOGS === '1' || process.env.FULL_LOGS === 'true');
  // Provide a logger that routes through safeLog/serializeForLog so HTTP meta
  // objects are expanded/truncated consistently with adapter logging.
  return createAxiosHttpClient({ debug, logger: wrapPinoLogger(console) });
}
