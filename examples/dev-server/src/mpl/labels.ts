/**
 * MPL: Create Label Routes
 * POST /api/dev/mpl/create-label - Single label
 * POST /api/dev/mpl/create-labels - Batch labels
 */

import { FastifyInstance } from 'fastify';
import { MPLAdapter } from '@shopickup/adapters-mpl';
import { safeValidateCreateLabelsRequest, type CreateLabelMPLRequest, type CreateLabelsMPLRequest } from '@shopickup/adapters-mpl/validation';
import {
  CarrierError,
  type AdapterContext,
  getHttpStatusForLabelBatchResponse,
} from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import { formatLabelResponseForHttp } from '../label-response-http.js';
import {
  MPL_CREDENTIALS_SCHEMA,
  EXAMPLE_MPL_CREDENTIALS_OAUTH,
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
          },
          credentials: MPL_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            description: 'Optional label generation parameters',
            properties: {
              // canonical cross-cutting size (maps to MPL labelType)
              size: {
                type: 'string',
                description: 'Canonical label size (A5, A4, A6, etc.)',
                enum: [
                  'A4', 'A5', 'A5inA4', 'A5E', 'A5E_EXTRA', 'A5E_STAND', 'A6', 'A6inA4', 'A4ONE'
                ],
              },
              useTestApi: { type: 'boolean' },
              mpl: {
                type: 'object',
                description: 'MPL-specific label options',
                properties: {
                  accountingCode: {
                    type: 'string',
                    description: 'MPL accounting code (required for label creation)',
                  },
                  labelFormat: { type: 'string', enum: ['PDF', 'ZPL'] },
                  singleFile: { type: 'boolean' },
                  orderBy: { type: 'string', enum: ['SENDING', 'IDENTIFIER'] },
                },
                required: ['accountingCode'],
              },
            },
          },
        },
        examples: [
          {
            parcelCarrierId: 'MLHUN12345671234567',
            credentials: EXAMPLE_MPL_CREDENTIALS_OAUTH,
            options: {
              size: 'A5',
              useTestApi: true,
              mpl: { accountingCode: 'ACC123', labelFormat: 'PDF' },
            },
          },
          {
            parcelCarrierId: 'MLHUN98765439876543',
            credentials: EXAMPLE_MPL_CREDENTIALS_OAUTH,
            options: {
              size: 'A4',
              useTestApi: true,
              mpl: { accountingCode: 'ACC123', labelFormat: 'PDF' },
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
            },
            status: {
              type: 'string',
              enum: ['created', 'failed', 'skipped'],
            },
            fileId: {
              type: ['string', 'null'],
              description: 'Reference to generated label file',
            },
            pageRange: {
              type: 'object',
              description: 'Page range in the file',
              properties: {
                start: { type: 'number'},
                end: { type: 'number'},
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
            file: {
              type: 'object',
              description: 'Resolved file metadata referenced by fileId',
              properties: {
                id: { type: 'string' },
                contentType: { type: 'string' },
                byteLength: { type: 'number' },
                pages: { type: 'number' },
                orientation: { type: 'string', enum: ['portrait', 'landscape'] },
                metadata: { type: 'object', additionalProperties: true },
                rawBytes: {
                  type: ['string', 'object', 'null'],
                  description: 'Raw bytes payload (Buffer-like object or base64 string in JSON)',
                  nullable: true,
                },
              },
              additionalProperties: true,
              nullable: true,
            },
            rawCarrierResponse: {
              type: 'object',
              description: 'Raw payload from underlying createLabels carrier call',
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

        const createReq: CreateLabelMPLRequest = {
          parcelCarrierId,
          credentials,
          options,
        };

        // Validate the request (use CreateLabels validation on single item)
        const validateReq: CreateLabelsMPLRequest = {
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

        return reply.status(200).send(formatLabelResponseForHttp(result));
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
              size: {
                type: 'string',
                description: 'Canonical label size (A5, A4, A6, etc.)',
                enum: [
                  'A4', 'A5', 'A5inA4', 'A5E', 'A5E_EXTRA', 'A5E_STAND', 'A6', 'A6inA4', 'A4ONE'
                ],
              },
              useTestApi: { type: 'boolean' },
              mpl: {
                type: 'object',
                description: 'MPL-specific label options',
                properties: {
                  accountingCode: { type: 'string' },
                  labelFormat: { type: 'string', enum: ['PDF', 'ZPL'] },
                  singleFile: { type: 'boolean' },
                  orderBy: { type: 'string', enum: ['SENDING', 'IDENTIFIER'] },
                },
                required: ['accountingCode'],
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
            credentials: EXAMPLE_MPL_CREDENTIALS_OAUTH,
            options: {
              size: 'A5',
              mpl: { accountingCode: 'ACC123', labelFormat: 'PDF' },
              useTestApi: true,
            },
          },
          {
            parcelCarrierIds: ['MLHUN12345671234567', 'MLHUN98765439876543'],
            credentials: EXAMPLE_MPL_CREDENTIALS_OAUTH,
            options: {
              size: 'A4',
              mpl: { accountingCode: 'ACC123', labelFormat: 'PDF', singleFile: true },
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

        const createReq: CreateLabelsMPLRequest = {
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

        return reply.status(statusCode).send(formatLabelResponseForHttp(result));
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
