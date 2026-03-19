import { wrapPinoLogger } from '../../examples/dev-server/src/http-client.js';
import { createAxiosHttpClient } from '@shopickup/core';
import type { AdapterContext } from '@shopickup/core';
import type { FastifyLoggerInstance } from 'fastify';

export function buildAdapterContext(httpClient: any, logger: FastifyLoggerInstance, operationName = 'examples-cli'): AdapterContext {
  return {
    http: httpClient,
    logger: wrapPinoLogger(logger),
    operationName,
    loggingOptions: { maxArrayItems: 5, maxDepth: 2, logRawResponse: 'summary' },
  } as AdapterContext;
}

export function createHttpClient() {
  return createAxiosHttpClient({ debug: false });
}
