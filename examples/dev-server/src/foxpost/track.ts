/**
 * Foxpost: Track Route Handler
 * POST /api/dev/foxpost/track
 * 
 * Validates incoming requests and adapter responses using Zod schemas
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter, safeValidateTrackingRequest, safeValidateFoxpostTracking } from '@shopickup/adapters-foxpost';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  FOXPOST_CREDENTIALS_SCHEMA,
  FOXPOST_OPTIONS_SCHEMA,
  EXAMPLE_CREDENTIALS,
  TRACKING_RESPONSE_SCHEMA,
} from './common.js';

export async function registerTrackRoute(
  fastify: FastifyInstance,
  adapter: FoxpostAdapter
) {
  fastify.post('/api/dev/foxpost/track', {
    schema: {
      description: 'Track a Foxpost parcel by clFoxId or uniqueBarcode (barcode)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Track parcel',
      body: {
        type: 'object',
        required: ['clFoxId', 'credentials'],
        properties: {
          clFoxId: {
            type: 'string',
            description: 'The clFoxId or uniqueBarcode of the parcel to track (passed as barcode to /api/tracking/{barcode})',
          },
          credentials: FOXPOST_CREDENTIALS_SCHEMA,
          options: FOXPOST_OPTIONS_SCHEMA,
        },
        examples: [
          {
            clFoxId: 'CLFOX176917219991175',
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true },
          }
        ],
      },
      response: TRACKING_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { clFoxId, credentials, options } = request.body as any;

        // Validate request using Zod schema
        const trackingReqValidation = safeValidateTrackingRequest({
          trackingNumber: clFoxId,
          credentials,
          options,
        });

        if (!trackingReqValidation.success) {
          return reply.status(400).send({
            message: 'Invalid request',
            details: trackingReqValidation.error.flatten(),
          });
        }

        // Prepare adapter context
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
          operationName: 'track',
          loggingOptions: {
            maxArrayItems: 5,
            maxDepth: 2,
            logRawResponse: 'summary',
            logMetadata: false,
          },
        };

        // Call adapter
        const trackingResponse = await adapter.track(trackingReqValidation.data, ctx);

        // Validate response against Zod schema (adapter should return validated FoxpostTracking in rawCarrierResponse)
        if (trackingResponse.rawCarrierResponse) {
          const responseValidation = safeValidateFoxpostTracking(trackingResponse.rawCarrierResponse);
          if (!responseValidation.success) {
            fastify.log.warn('Adapter returned unvalidated tracking response');
            // Still return response but log warning
          }
        }

        return reply.status(200).send(trackingResponse);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          // Map carrier error categories to HTTP status codes
          const statusCode = 
            error.category === 'Auth' ? 401 : 
            error.category === 'RateLimit' ? 429 :
            error.category === 'Transient' ? 502 :
            400;
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
