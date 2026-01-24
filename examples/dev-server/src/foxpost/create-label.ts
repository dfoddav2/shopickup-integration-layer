/**
 * Foxpost: Create Label Route Handler
 * POST /api/dev/foxpost/create-label
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCreateLabelRequest } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext, type CreateLabelRequest } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  FOXPOST_CREDENTIALS_SCHEMA,
  FOXPOST_OPTIONS_SCHEMA,
  EXAMPLE_CREDENTIALS,
  SINGLE_LABEL_RESPONSE_SCHEMA,
} from './common.js';

export async function registerCreateLabelRoute(
  fastify: FastifyInstance,
  adapter: FoxpostAdapter
) {
  fastify.post('/api/dev/foxpost/create-label', {
    schema: {
      description: 'Create a single Foxpost label (dev endpoint for testing)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Create a single label for a parcel',
      body: {
        type: 'object',
        required: ['parcelCarrierId', 'credentials'],
        properties: {
          parcelCarrierId: {
            type: 'string',
            description: 'The Foxpost parcel ID (clFoxId) to create a label for',
            example: 'CLFOX0000000001',
          },
          credentials: FOXPOST_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            description: 'Optional label generation options',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test API endpoint instead of production',
                default: false,
              },
              size: {
                type: 'string',
                enum: ['A6', 'A7', '85x85'],
                description: 'Label size format',
                default: 'A7',
              },
              startPos: {
                type: 'integer',
                minimum: 1,
                maximum: 7,
                description: 'Starting position for A7 labels on A4 page (1-7)',
              },
            },
          },
        },
        examples: [
          {
            parcelCarrierId: 'CLFOX0000000001',
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true, size: 'A7' },
          },
          {
            parcelCarrierId: 'CLFOX0000000001',
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true, size: 'A6' },
          },
        ],
      },
      response: SINGLE_LABEL_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { parcelCarrierId, credentials, options } = request.body as any;

        const createReq: CreateLabelRequest = {
          parcelCarrierId,
          credentials,
          options,
        };

        // Validate the request
        const validated = safeValidateCreateLabelRequest(createReq);
        if (!validated.success) {
          return reply.status(400).send({
            message: `Validation error: ${validated.error.message}`,
            category: 'Validation',
            errors: validated.error.issues,
          });
        }

        // Call adapter
        const httpClient = (fastify as any).httpClient;
        if (!httpClient) {
          return reply.status(500).send({
            message: 'HTTP client not configured',
            category: 'Internal',
          });
        }

        const ctx: AdapterContext = {
          http: httpClient,
          logger: wrapPinoLogger(fastify.log),
        };

        // Invoke createLabel method
        const result = await adapter.createLabel(createReq, ctx);

        // Log the adapter response for verification
        fastify.log.info({
          carrierId: result.carrierId,
          status: result.status,
          hasLabelUrl: !!(result as any).labelUrl,
          labelUrlLength: (result as any).labelUrl?.length || 0,
          hasErrors: result.errors && result.errors.length > 0,
          hasRaw: !!result.raw,
        }, 'Foxpost adapter createLabel response');

        // Determine HTTP status code
        let statusCode = 200;
        if (result.status === 'failed') {
          const hasValidationErrors = result.errors && result.errors.length > 0;
          statusCode = hasValidationErrors ? 400 : 500;
        }

        return reply.status(statusCode).send(result);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          const statusCode = error.category === 'Auth' ? 401 : 400;
          return reply.status(statusCode).send({
            message: error.message,
            category: error.category,
            ...(error.carrierCode && { carrierCode: error.carrierCode }),
            raw: error.raw,
          });
        }

        return reply.status(500).send({
          message: error instanceof Error ? error.message : String(error),
          category: 'Internal',
        });
      }
    },
  });
}
