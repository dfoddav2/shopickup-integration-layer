/**
 * MPL: Create Label Routes
 * POST /api/dev/mpl/create-label - Single label
 * POST /api/dev/mpl/create-labels - Batch labels
 */

import { FastifyInstance } from 'fastify';
import { MPLAdapter } from '@shopickup/adapters-mpl';
import { safeValidateCreateLabelsRequest } from '@shopickup/adapters-mpl/validation';
import {
  CarrierError,
  type AdapterContext,
  type CreateLabelsRequest,
  type CreateLabelRequest,
  getHttpStatusForLabelBatchResponse,
} from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  MPL_CREDENTIALS_SCHEMA,
  EXAMPLE_MPL_CREDENTIALS_APIKEY,
  MPL_LABEL_OPTIONS_SCHEMA,
  MPL_AUTHENTICATION_ERROR_SCHEMA,
  MPL_CREATE_LABELS_RESPONSE_SCHEMA,
} from './common.js';

export async function registerCreateLabelRoute(
  fastify: FastifyInstance,
  adapter: MPLAdapter
) {
  fastify.post('/api/dev/mpl/create-label', {
    schema: {
      description: 'Create label for single MPL parcel (dev endpoint for testing)',
      tags: ['MPL'],
      summary: 'Create single label',
      body: {
        type: 'object',
        required: ['parcelCarrierId', 'credentials'],
        properties: {
          parcelCarrierId: {
            type: 'string',
            description: 'MPL tracking number for the parcel',
            example: 'MLHUN12345671234567',
          },
          credentials: MPL_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            description: 'Optional label generation parameters',
            properties: {
              ...MPL_LABEL_OPTIONS_SCHEMA.properties,
              accountingCode: {
                type: 'string',
                description: 'MPL accounting code (required for label creation)',
              },
            },
          },
        },
        examples: [
          {
            parcelCarrierId: 'MLHUN12345671234567',
            credentials: EXAMPLE_MPL_CREDENTIALS_APIKEY,
            options: {
              labelType: 'A5',
              labelFormat: 'PDF',
              accountingCode: 'ACC123',
            },
          },
          {
            parcelCarrierId: 'MLHUN98765439876543',
            credentials: EXAMPLE_MPL_CREDENTIALS_APIKEY,
            options: {
              labelType: 'A4',
              labelFormat: 'PDF',
              accountingCode: 'ACC123',
              useTestApi: true,
            },
          },
        ],
      },
      response: {
        200: {
          description: 'Successfully created label for single parcel',
          type: 'object',
          properties: {
            inputId: {
              type: 'string',
              description: 'Original tracking number',
              example: 'MLHUN12345671234567',
            },
            status: {
              type: 'string',
              enum: ['created', 'failed', 'skipped'],
              example: 'created',
            },
            fileId: {
              type: ['string', 'null'],
              description: 'Reference to generated label file',
              example: 'label-uuid-1',
            },
            pageRange: {
              type: 'object',
              description: 'Page range in the file',
              properties: {
                start: { type: 'number', example: 1 },
                end: { type: 'number', example: 1 },
              },
              nullable: true,
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  field: { type: 'string' },
                },
              },
              nullable: true,
            },
            raw: {
              type: 'object',
              description: 'Raw carrier response',
              additionalProperties: true,
              nullable: true,
            },
          },
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
            raw: { type: 'object', additionalProperties: true },
          },
        },
        401: MPL_AUTHENTICATION_ERROR_SCHEMA,
        429: {
          description: 'Rate limit exceeded',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string', enum: ['RateLimit'] },
            retryAfterMs: { type: 'number' },
            raw: { type: 'object', additionalProperties: true },
          },
        },
        500: {
          description: 'Server error',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string', enum: ['Transient'] },
            raw: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async handler(request: any, reply: any) {
      try {
        const { parcelCarrierId, credentials, options } = request.body as any;

        const createReq: CreateLabelRequest = {
          parcelCarrierId,
          credentials,
          options,
        };

        // Validate the request (use CreateLabels validation on single item)
        const validateReq: CreateLabelsRequest = {
          parcelCarrierIds: [parcelCarrierId],
          credentials,
          options,
        };
        const validated = safeValidateCreateLabelsRequest(validateReq);
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

        // Invoke createLabel method
        const result = await adapter.createLabel(createReq, ctx);

        // Log the response
        fastify.log.info(
          {
            parcelCarrierId,
            status: result.status,
            fileId: result.fileId,
          },
          'MPL adapter createLabel response'
        );

        return reply.status(200).send(result);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          const statusCode = error.category === 'Auth' ? 401 : error.category === 'RateLimit' ? 429 : 400;
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

export async function registerCreateLabelsRoute(
  fastify: FastifyInstance,
  adapter: MPLAdapter
) {
  fastify.post('/api/dev/mpl/create-labels', {
    schema: {
      description: 'Create labels for multiple MPL parcels (dev endpoint for testing)',
      tags: ['MPL'],
      summary: 'Batch create labels for multiple parcels',
      body: {
        type: 'object',
        required: ['parcelCarrierIds', 'credentials'],
        properties: {
          parcelCarrierIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Array of MPL tracking numbers to create labels for',
          },
          credentials: MPL_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            description: 'Optional label generation parameters',
            properties: {
              ...MPL_LABEL_OPTIONS_SCHEMA.properties,
              accountingCode: {
                type: 'string',
                description: 'MPL accounting code (required for label creation)',
              },
            },
          },
        },
        examples: [
          {
            parcelCarrierIds: [
              'MLHUN12345671234567',
              'MLHUN12345671234568',
              'MLHUN12345671234569',
            ],
            credentials: EXAMPLE_MPL_CREDENTIALS_APIKEY,
            options: {
              labelType: 'A5',
              labelFormat: 'PDF',
              accountingCode: 'ACC123',
            },
          },
          {
            parcelCarrierIds: ['MLHUN12345671234567', 'MLHUN98765439876543'],
            credentials: EXAMPLE_MPL_CREDENTIALS_APIKEY,
            options: {
              labelType: 'A4',
              labelFormat: 'PDF',
              singleFile: true,
              accountingCode: 'ACC123',
              useTestApi: true,
            },
          },
        ],
      },
      response: MPL_CREATE_LABELS_RESPONSE_SCHEMA,
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
        fastify.log.info(
          {
            totalCount: result.totalCount,
            successCount: result.successCount,
            failureCount: result.failureCount,
            allSucceeded: result.allSucceeded,
            allFailed: result.allFailed,
            someFailed: result.someFailed,
            summary: result.summary,
          },
          'MPL adapter createLabels batch response'
        );

        // Determine HTTP status code based on batch results
        const statusCode = getHttpStatusForLabelBatchResponse(result);

        return reply.status(statusCode).send(result);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          const statusCode =
            error.category === 'Auth'
              ? 401
              : error.category === 'RateLimit'
              ? 429
              : 400;
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
