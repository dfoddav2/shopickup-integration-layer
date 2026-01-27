/**
 * MPL: Exchange Auth Token Route Handler
 * POST /api/dev/mpl/exchange-auth-token
 * 
 * Allows exchanging API credentials (apiKey + apiSecret) for an OAuth2 Bearer token.
 * Useful when:
 * - Basic auth is disabled at the MPL account level
 * - You want to cache tokens to reduce network calls
 * - You need explicit control over token lifecycle
 */

import { FastifyInstance } from 'fastify';
import type { CarrierAdapter } from '@shopickup/core';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  MPL_EXCHANGE_AUTH_TOKEN_RESPONSE_SCHEMA,
  EXAMPLE_MPL_CREDENTIALS_APIKEY,
} from './common.js';

export async function registerExchangeAuthTokenRoute(
  fastify: FastifyInstance,
  adapter: CarrierAdapter
) {
  fastify.post('/api/dev/mpl/exchange-auth-token', {
    schema: {
      description: 'Exchange API credentials for OAuth2 Bearer token',
      tags: ['MPL', 'Dev', 'Auth'],
      summary: 'Exchange auth token',
      consumes: ['application/json'],  // Explicitly declare what we accept
      body: {
        type: 'object',
        additionalProperties: false,  // Disallow extra properties
        properties: {
          credentials: {
            type: 'object',
            description: 'MPL API credentials (apiKey+apiSecret OR oAuth2Token)',
            additionalProperties: false,
            properties: {
              authType: {
                type: 'string',
                enum: ['apiKey', 'oauth2'],
                description: 'Authentication method (auto-detected if omitted)'
              },
              apiKey: { type: 'string', description: 'For apiKey auth' },
              apiSecret: { type: 'string', description: 'For apiKey auth' },
              oAuth2Token: { type: 'string', description: 'For oauth2 auth' },
            }
          },
          options: {
            type: 'object',
            additionalProperties: false,
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint',
                default: false
              }
            }
          }
        },
        required: ['credentials'],
        examples: [
          {
            credentials: EXAMPLE_MPL_CREDENTIALS_APIKEY,
            options: {
              useTestApi: false,
            },
          }
        ]
      },
      response: MPL_EXCHANGE_AUTH_TOKEN_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
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
          operationName: 'exchangeAuthToken',
          loggingOptions: {
            maxArrayItems: 10,
            maxDepth: 2,
            logRawResponse: 'summary',
            logMetadata: false,
          },
        };

        // Call adapter with full request body
        const tokenResponse = await (adapter as any).exchangeAuthToken(request.body, ctx);

        return reply.status(200).send(tokenResponse);
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
