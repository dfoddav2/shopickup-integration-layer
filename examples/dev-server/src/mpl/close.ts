/**
 * MPL: Close Shipments Route
 * POST /api/dev/mpl/close-shipments
 */

import { FastifyInstance } from 'fastify';
import { MPLAdapter } from '@shopickup/adapters-mpl';
import { safeValidateCloseShipmentsRequest } from '@shopickup/adapters-mpl/validation';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import { MPL_CREDENTIALS_SCHEMA } from './common.js';

export async function registerCloseShipmentsRoute(fastify: FastifyInstance, adapter: MPLAdapter) {
  fastify.post('/api/dev/mpl/close-shipments', {
    schema: {
      description: 'Close multiple shipments (generate manifests) for MPL - dev endpoint',
      tags: ['MPL', 'Dev'],
      summary: 'Close shipments (batch)',
      body: {
        type: 'object',
        required: ['credentials', 'trackingNumbers'],
        properties: {
          trackingNumbers: { type: 'array', items: { type: 'string' }, minItems: 1 },
          credentials: MPL_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            properties: {
              useTestApi: { type: 'boolean' },
              mpl: {
                type: 'object',
                properties: {
                  accountingCode: { type: 'string' },
                },
                required: ['accountingCode'],
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  manifestId: { type: 'string' },
                  manifest: { type: ['string', 'object', 'null'] },
                  errors: { type: 'array', items: { type: 'object' } },
                  warnings: { type: 'array', items: { type: 'object' } },
                  raw: { type: 'object', additionalProperties: true },
                },
              },
            },
            successCount: { type: 'number' },
            failureCount: { type: 'number' },
            totalCount: { type: 'number' },
            allSucceeded: { type: 'boolean' },
            allFailed: { type: 'boolean' },
            someFailed: { type: 'boolean' },
            summary: { type: 'string' },
            rawCarrierResponse: { type: 'object', additionalProperties: true },
          },
        },
        400: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
    async handler(request: any, reply: any) {
      try {
        const { trackingNumbers, credentials, options } = request.body as any;

        const closeReq = {
          trackingNumbers,
          credentials,
          options,
        } as any;

        const validated = safeValidateCloseShipmentsRequest({ trackingNumbers, credentials, options });
        if (!validated.success) {
          return reply.status(400).send({
            message: `Validation error: ${validated.error.message}`,
            category: 'Validation',
            errors: validated.error.issues,
          });
        }

        const httpClient = (fastify as any).httpClient;
        if (!httpClient) {
          return reply.status(500).send({ message: 'HTTP client not configured', category: 'Internal' });
        }

        const ctx: AdapterContext = {
          http: httpClient,
          logger: wrapPinoLogger(fastify.log),
          operationName: 'closeShipments',
          loggingOptions: {
            logRawResponse: 'summary',
            maxArrayItems: 5,
          },
        };

        if (typeof (adapter as any).closeShipments !== 'function') {
          return reply.status(501).send({ message: 'Adapter does not implement closeShipments', category: 'NotImplemented' });
        }

        const result: any = await (adapter as any).closeShipments(closeReq, ctx);

        return reply.status(200).send(result);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          const statusCode = error.category === 'Auth' ? 401 : error.category === 'RateLimit' ? 429 : 400;
          return reply.status(statusCode).send({ message: error.message, category: error.category, raw: error.raw });
        }

        return reply.status(500).send({ message: error instanceof Error ? error.message : String(error), category: 'Internal' });
      }
    },
  });
}
