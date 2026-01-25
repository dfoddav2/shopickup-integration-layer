/**
 * Foxpost: Create Label Route Handler
 * POST /api/dev/foxpost/create-label
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCreateLabelRequest } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext, type CreateLabelRequest, type CreateLabelsRequest } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  FOXPOST_CREDENTIALS_SCHEMA,
  FOXPOST_OPTIONS_SCHEMA,
  EXAMPLE_CREDENTIALS,
  BATCH_LABEL_RESPONSE_SCHEMA,
} from './common.js';

export async function registerCreateLabelRoute(
  fastify: FastifyInstance,
  adapter: FoxpostAdapter
) {
   fastify.post('/api/dev/foxpost/create-label', {
     schema: {
       description: 'Create a single Foxpost label (dev endpoint for testing)',
       tags: ['Foxpost', 'Dev'],
       summary: 'Create a label for a single parcel',
       body: {
         type: 'object',
         required: ['parcelCarrierId', 'credentials'],
         properties: {
           parcelCarrierId: {
             type: 'string',
             description: 'The Foxpost parcel ID (clFoxId) to create a label for',
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
                  minimum: 0,
                  maximum: 7,
                  description: 'Starting position for A7 labels on A4 page (0-7)',
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
       response: BATCH_LABEL_RESPONSE_SCHEMA,
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
           operationName: 'createLabel',
           loggingOptions: {
             maxArrayItems: 5,
             maxDepth: 2,
             logRawResponse: 'summary',
             logMetadata: false,
           },
         };

        // Convert to batch request and call createLabels
        // This ensures we get the full CreateLabelsResponse with files[] array
        // Build options carefully - only include explicitly provided values
        const batchOptions: any = {};
        if (options?.useTestApi !== undefined) batchOptions.useTestApi = options.useTestApi;
        if (options?.size !== undefined) batchOptions.size = options.size;
        if (options?.startPos !== undefined) batchOptions.startPos = options.startPos;
        if (options?.isPortrait !== undefined) batchOptions.isPortrait = options.isPortrait;

        const batchReq: CreateLabelsRequest = {
          parcelCarrierIds: [validated.data.parcelCarrierId],
          credentials: validated.data.credentials!,
          options: Object.keys(batchOptions).length > 0 ? batchOptions : undefined,
        };

        const result = await adapter.createLabels(batchReq, ctx);

        // Log the adapter response for verification
        fastify.log.info({
          totalCount: result.totalCount,
          successCount: result.successCount,
          failureCount: result.failureCount,
          filesCount: result.files?.length || 0,
          resultsCount: result.results.length,
        }, 'Foxpost adapter createLabel response');

        // Determine HTTP status code
        let statusCode = 200;
        if (result.allFailed) {
          statusCode = 400;
        } else if (result.someFailed) {
          statusCode = 207;
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
