/**
 * Foxpost: Create Parcels (Batch) Route Handler
 * POST /api/dev/foxpost/create-parcels
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCreateParcelsRequest } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext, type CreateParcelsRequest, getHttpStatusForBatchResponse } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  FOXPOST_CREDENTIALS_SCHEMA,
  FOXPOST_OPTIONS_SCHEMA,
  EXAMPLE_PARCEL_HOME_DELIVERY,
  EXAMPLE_PARCEL_APM_DELIVERY,
  EXAMPLE_CREDENTIALS,
  BATCH_PARCEL_RESPONSE_SCHEMA,
} from './common.js';

export async function registerCreateParcelsRoute(
  fastify: FastifyInstance,
  adapter: FoxpostAdapter
) {
  fastify.post('/api/dev/foxpost/create-parcels', {
    schema: {
      description: 'Create multiple Foxpost parcels in one call (dev endpoint)',
      tags: ['Foxpost'],
      summary: 'Create multiple parcels in batch',
      body: {
        type: 'object',
        required: ['parcels', 'credentials'],
        properties: {
          parcels: {
            type: 'array',
            description: 'Array of canonical parcels',
            minItems: 1,
          },
          credentials: FOXPOST_CREDENTIALS_SCHEMA,
          options: FOXPOST_OPTIONS_SCHEMA,
        },
        examples: [
          {
            parcels: [EXAMPLE_PARCEL_HOME_DELIVERY, EXAMPLE_PARCEL_APM_DELIVERY],
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true },
          },
        ]
      },
      response: BATCH_PARCEL_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { parcels, credentials, options } = request.body as any;

        const createReq: CreateParcelsRequest = {
          parcels,
          credentials,
          options,
        };

        // Validate the request
        const validated = safeValidateCreateParcelsRequest(createReq);
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
          operationName: 'createParcels',
          loggingOptions: {
            maxArrayItems: 5,
            maxDepth: 2,
            logRawResponse: 'summary',
            logMetadata: false,
          },
        };

        const response = await adapter.createParcels(createReq, ctx);

        // Log the full adapter response for verification before schema filtering
        fastify.log.info({
          summary: response.summary,
          successCount: response.successCount,
          failureCount: response.failureCount,
          totalCount: response.totalCount,
          allSucceeded: response.allSucceeded,
          allFailed: response.allFailed,
          someFailed: response.someFailed,
          resultsCount: response.results.length,
          hasRawCarrierResponse: !!response.rawCarrierResponse,
        }, 'Foxpost adapter response (full):');

        // Response is now strongly-typed as CreateParcelsResponse
        const statusCode = getHttpStatusForBatchResponse(response);

        return reply.status(statusCode).send(response);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          // Map carrier error categories to HTTP status codes
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
