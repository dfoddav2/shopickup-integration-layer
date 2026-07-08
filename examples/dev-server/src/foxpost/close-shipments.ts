/**
 * Foxpost: Close Shipments Route
 * POST /api/dev/foxpost/close-shipments
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCloseShipmentsRequest } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import { formatLabelResponseForHttp } from '../label-response-http.js';
import { FOXPOST_CREDENTIALS_SCHEMA, EXAMPLE_CREDENTIALS } from './common.js';

export async function registerCloseShipmentsRoute(fastify: FastifyInstance, adapter: FoxpostAdapter) {
  fastify.post('/api/dev/foxpost/close-shipments', {
    schema: {
      description: 'Generate a delivery note (bill of delivery) PDF for a batch of Foxpost parcels - dev endpoint',
      tags: ['Foxpost', 'Dev'],
      summary: 'Close shipments (generate delivery note)',
      body: {
        type: 'object',
        required: ['trackingNumbers', 'credentials', 'options'],
        properties: {
          trackingNumbers: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Foxpost parcel barcodes (clFoxCodes) to include in the delivery note',
          },
          credentials: FOXPOST_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            required: ['foxpost'],
            properties: {
              useTestApi: { type: 'boolean' },
              foxpost: {
                type: 'object',
                required: ['sender'],
                properties: {
                  sender: { type: 'string', description: 'Sender account id used to look up parcels' },
                },
              },
            },
          },
        },
        examples: [
          {
            trackingNumbers: ['CLFOX0000000001', 'CLFOX0000000002'],
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true, foxpost: { sender: 'my-sender-account' } },
          },
        ],
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
                  fileIds: { type: 'array', items: { type: 'string' } },
                  errors: { type: 'array', items: { type: 'object' } },
                  warnings: { type: 'array', items: { type: 'object' } },
                  raw: { type: 'object', additionalProperties: true },
                },
              },
            },
            files: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string' },
                  contentType: { type: 'string' },
                  labelFormat: { type: 'string' },
                  byteLength: { type: 'number' },
                  metadata: { type: 'object', additionalProperties: true },
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

        const closeReq = { trackingNumbers, credentials, options } as any;

        const validated = safeValidateCloseShipmentsRequest(closeReq);
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

        const result = await adapter.closeShipments(closeReq, ctx);

        return reply.status(200).send(formatLabelResponseForHttp(result));
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
