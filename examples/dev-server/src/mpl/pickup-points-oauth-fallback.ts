/**
 * MPL: Fetch Pickup Points with OAuth Fallback Route Handler
 * POST /api/dev/mpl/pickup-points-oauth-fallback
 * 
 * This endpoint demonstrates the OAuth fallback mechanism:
 * - Accepts API credentials (apiKey + apiSecret)
 * - Wraps the HTTP client with withOAuthFallback to automatically handle 401 errors
 * - When Basic auth fails (401 with "Basic auth not enabled" error):
 *   1. Automatically exchanges credentials for an OAuth2 Bearer token
 *   2. Retries the request with the Bearer token
 *   3. Returns the successful response
 * 
 * This pattern allows integrators to use standard API credentials, while the
 * wrapper transparently handles the OAuth fallback when needed, without modifying
 * adapter code or calling exchangeAuthToken explicitly.
 * 
 * Compare with /api/dev/mpl/pickup-points which requires you to manage credentials
 * and authentication type yourself (either apiKey or oauth2Token, but not both).
 */

import { FastifyInstance } from 'fastify';
import type { CarrierAdapter } from '@shopickup/core';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { withOAuthFallback, type ResolveBaseUrl, type ResolveOAuthUrl } from '@shopickup/adapters-mpl';
import { wrapPinoLogger } from '../http-client.js';
import {
  MPL_PICKUP_POINTS_RESPONSE_SCHEMA,
  EXAMPLE_MPL_CREDENTIALS_APIKEY,
} from './common.js';

export async function registerPickupPointsOAuthFallbackRoute(
  fastify: FastifyInstance,
  adapter: CarrierAdapter,
  resolveBaseUrl: ResolveBaseUrl,
  resolveOAuthUrl: ResolveOAuthUrl
) {
  fastify.post('/api/dev/mpl/pickup-points-oauth-fallback', {
    schema: {
      description: 'Fetch list of MPL pickup points with automatic OAuth fallback for when Basic auth is disabled',
      tags: ['MPL', 'Dev'],
      summary: 'Fetch pickup points (OAuth fallback)',
      consumes: ['application/json'],
      body: {
        type: 'object',
        properties: {
          credentials: {
            type: 'object',
            description: 'MPL API credentials (apiKey+apiSecret). The wrapper automatically exchanges for OAuth2 token if needed.',
            properties: {
              apiKey: { type: 'string', description: 'API key for Basic auth' },
              apiSecret: { type: 'string', description: 'API secret for Basic auth' },
            }
          },
          accountingCode: {
            type: 'string',
            description: 'MPL accounting code for the request',
          },
          postCode: {
            type: 'string',
            description: 'Optional: filter by postal code (4 characters)',
          },
          city: {
            type: 'string',
            description: 'Optional: filter by city name',
          },
          servicePointType: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['PM', 'PP', 'CS'],
            },
            description: 'Optional: filter by service point type (PM=Post Office, PP=Post Point, CS=Parcel Locker)',
          },
          options: {
            type: 'object',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint',
                default: false
              }
            }
          }
        },
        required: ['credentials', 'accountingCode'],
        examples: [
          {
            credentials: EXAMPLE_MPL_CREDENTIALS_APIKEY,
            accountingCode: 'ACC123456',
            postCode: '',
            city: '',
            servicePointType: [],
          }
        ]
      },
      response: MPL_PICKUP_POINTS_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        // Validate request body
        const { credentials, accountingCode, options } = request.body;

        if (!credentials || typeof credentials !== 'object') {
          return reply.status(400).send({
            message: 'Invalid request: credentials object required',
            category: 'Validation',
          });
        }

        if (!credentials.apiKey || !credentials.apiSecret) {
          return reply.status(400).send({
            message: 'Invalid request: apiKey and apiSecret required for OAuth fallback',
            category: 'Validation',
          });
        }

        if (!accountingCode) {
          return reply.status(400).send({
            message: 'Invalid request: accountingCode required',
            category: 'Validation',
          });
        }

        // Prepare base HTTP client
        const baseHttpClient = (fastify as any).httpClient;
        if (!baseHttpClient) {
          return reply.status(500).send({
            message: 'HTTP client not configured',
            category: 'Internal',
          });
        }

         // Wrap HTTP client with OAuth fallback
         const logger = wrapPinoLogger(fastify.log);
         const useTestApi = options?.useTestApi ?? false;
         const wrappedHttpClient = withOAuthFallback(
           baseHttpClient,
           {
             authType: 'apiKey',
             apiKey: credentials.apiKey,
             apiSecret: credentials.apiSecret,
           },
           accountingCode,
           resolveOAuthUrl,
           logger,
           useTestApi
         );

        // Prepare adapter context with wrapped HTTP client
        const ctx: AdapterContext = {
          http: wrappedHttpClient,
          logger,
          operationName: 'fetchPickupPoints',
          loggingOptions: {
            // Silent by default to prevent verbose pickup point list logging
            silentOperations: ['fetchPickupPoints'],
            maxArrayItems: 10,
            maxDepth: 2,
            logRawResponse: 'summary',
            logMetadata: false,
          },
        };

        // Build request body for adapter
        const pickupPointsRequest = {
          credentials: {
            authType: 'apiKey',
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret,
          },
          accountingCode,
          postCode: request.body.postCode || '',
          city: request.body.city || '',
          servicePointType: request.body.servicePointType || [],
          options: options || {},
        };

        // Call adapter with wrapped HTTP client
        const pickupPointsResponse = await adapter.fetchPickupPoints!(pickupPointsRequest, ctx);

        return reply.status(200).send(pickupPointsResponse);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          // Map carrier error categories to HTTP status codes
          const statusCode =
            error.category === 'Auth' ? 401 :
              error.category === 'RateLimit' ? 429 :
                error.category === 'Validation' ? 400 :
                  error.category === 'Transient' ? 503 :
                    400;

          return reply.status(statusCode).send({
            message: error.message,
            category: error.category,
            ...(error.raw ? { raw: error.raw } : {}),
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
