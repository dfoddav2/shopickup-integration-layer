/**
 * Foxpost: Create Parcel Route Handler
 * POST /api/dev/foxpost/create-parcel
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCreateParcelRequest } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext, type CreateParcelRequest } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  FOXPOST_CREDENTIALS_SCHEMA,
  FOXPOST_OPTIONS_SCHEMA,
  FOXPOST_AUTHENTICATION_ERROR_SCHEMA,
  EXAMPLE_PARCEL_HOME_DELIVERY,
  EXAMPLE_PARCEL_APM_DELIVERY,
  EXAMPLE_CREDENTIALS,
  SINGLE_PARCEL_RESPONSE_SCHEMA,
} from './common.js';

export async function registerCreateParcelRoute(
  fastify: FastifyInstance,
  adapter: FoxpostAdapter
) {
  fastify.post('/api/dev/foxpost/create-parcel', {
    schema: {
      description: 'Create a Foxpost parcel (dev endpoint for testing)',
      tags: ['Foxpost'],
      summary: 'Create a single parcel in Foxpost',
      body: {
        type: 'object',
        required: ['parcel', 'credentials'],
        properties: {
          parcel: {
            type: 'object',
            description: 'Canonical parcel with complete shipping details (shipper + recipient)',
          },
          credentials: FOXPOST_CREDENTIALS_SCHEMA,
          options: FOXPOST_OPTIONS_SCHEMA,
        },
        examples: [
          {
            parcel: EXAMPLE_PARCEL_HOME_DELIVERY,
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true },
          },
          {
            parcel: EXAMPLE_PARCEL_APM_DELIVERY,
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true },
          },
        ],
      },
      response: SINGLE_PARCEL_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { parcel, credentials, options } = request.body as any;

        const createReq: CreateParcelRequest = {
          parcel,
          credentials,
          options,
        };

        // Validate the request
        const validated = safeValidateCreateParcelRequest(createReq);
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
           operationName: 'createParcel',
           loggingOptions: {
             maxArrayItems: 5,
             maxDepth: 2,
             logRawResponse: 'summary',
             logMetadata: false,
           },
         };

        // Invoke createParcel method
        const result = await adapter.createParcel(createReq, ctx);

        // Log the full adapter response for verification
        fastify.log.info({
          carrierId: result.carrierId,
          status: result.status,
          hasLabelUrl: !!(result as any).labelUrl,
          hasErrors: result.errors && result.errors.length > 0,
          hasRaw: !!result.raw,
          hasRawCarrierResponse: !!(result as any).rawCarrierResponse,
          resultKeys: Object.keys(result),
        }, 'Foxpost adapter createParcel response (full):');

        // Determine HTTP status code based on result
        let statusCode = 200; // Default: success
        if (result.status === 'failed') {
          // Single parcel failed - return 400 if validation errors, 500 for other errors
          const hasValidationErrors = result.errors && result.errors.length > 0;
          statusCode = hasValidationErrors ? 400 : 500;
        }

        return reply.status(statusCode).send(result);
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
