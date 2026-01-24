/**
 * Foxpost: Create Labels (Batch) Route Handler
 * POST /api/dev/foxpost/create-labels
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCreateLabelsRequest } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext, type CreateLabelsRequest, getHttpStatusForLabelBatchResponse } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  FOXPOST_CREDENTIALS_SCHEMA,
  EXAMPLE_CREDENTIALS,
  BATCH_LABEL_RESPONSE_SCHEMA,
} from './common.js';

export async function registerCreateLabelsRoute(
  fastify: FastifyInstance,
  adapter: FoxpostAdapter
) {
  fastify.post('/api/dev/foxpost/create-labels', {
    schema: {
      description: 'Create labels for multiple Foxpost parcels (dev endpoint for testing)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Batch create labels for multiple parcels',
      body: {
        type: 'object',
        required: ['parcelCarrierIds', 'credentials'],
        properties: {
          parcelCarrierIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Array of Foxpost parcel IDs (clFoxId) to create labels for',
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
                 enum: ['A6', 'A7', '_85X85'],
                 description: 'Label size format',
                 default: 'A7',
               },
              startPos: {
                type: 'integer',
                minimum: 1,
                maximum: 7,
                description: 'Starting position for A7 labels on A4 page (1-7), only for A7 size',
              },
            },
          },
        },
        examples: [
          {
            parcelCarrierIds: ['CLFOX0000000001', 'CLFOX0000000002', 'CLFOX0000000003'],
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true, size: 'A7' },
          },
          {
            parcelCarrierIds: ['CLFOX0000000001', 'CLFOX0000000002'],
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true, size: 'A7', startPos: 3 },
          },
        ],
      },
      response: BATCH_LABEL_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { parcelCarrierIds, credentials, options } = request.body as any;

        const createReq: CreateLabelsRequest = {
          parcelCarrierIds,
          credentials,
          options,
        };

        // Validate the request
        const validated = safeValidateCreateLabelsRequest(createReq);
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
           operationName: 'createLabels',
           loggingOptions: {
             maxArrayItems: 5,
             maxDepth: 2,
             logRawResponse: 'summary',
             logMetadata: false,
           },
         };

        // Invoke createLabels method
        const result = await adapter.createLabels(createReq, ctx);

        // Log the batch response summary
        fastify.log.info({
          totalCount: result.totalCount,
          successCount: result.successCount,
          failureCount: result.failureCount,
          allSucceeded: result.allSucceeded,
          allFailed: result.allFailed,
          someFailed: result.someFailed,
          summary: result.summary,
        }, 'Foxpost adapter createLabels batch response');

        // Determine HTTP status code based on batch results
        const statusCode = getHttpStatusForLabelBatchResponse(result);

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
