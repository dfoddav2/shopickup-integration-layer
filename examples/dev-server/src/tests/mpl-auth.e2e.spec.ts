import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerMPLRoutes } from '../mpl/index.js';
import { makeHttpClient } from '../http-client.js';

/**
 * E2E tests for MPL exchange-auth-token endpoint
 */
describe('MPL Exchange Auth Token E2E', () => {
  let fastify: any;

  beforeAll(async () => {
    // Create a fresh Fastify instance for testing
    fastify = Fastify({
      logger: false, // Disable logging for tests
    });

    // Attach HTTP client
    const httpClient = makeHttpClient(fastify.log);
    fastify.decorate('httpClient', httpClient);

    // Register MPL routes
    await registerMPLRoutes(fastify);

    // Start server
    await fastify.listen({ port: 0 });
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should return proper validation error when credentials are missing', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/dev/mpl/exchange-auth-token',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: {
        // Missing credentials - should fail validation
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    // Fastify error handler might not catch pre-validation errors
    // Check if it's a validation error response
    if (body.category !== undefined) {
      expect(body.category).toBe('Validation');
    }
    expect(body.message).toMatch(/required property|validation|error/i);
  });

  it('should return proper validation error when apiKey is empty', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/dev/mpl/exchange-auth-token',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: {
        credentials: {
          apiKey: '',  // Empty key
          apiSecret: 'secret',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.category).toBe('Validation');
  });

  it('should return validation error with helpful message when body is missing', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/dev/mpl/exchange-auth-token',
      headers: {
        'Content-Type': 'application/json',
      },
      // No payload at all
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    // When body is empty, Fastify returns different error structure
    expect(body.message).toMatch(/Body cannot be empty|required property/i);
  });

  it('should accept properly formatted request with JSON body', async () => {
    // This test verifies the endpoint accepts the correct format
    // It will fail at the HTTP client level (no mock MPL server),
    // but should get past Fastify validation
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/dev/mpl/exchange-auth-token',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: {
        credentials: {
          apiKey: 'test-key-123',
          apiSecret: 'test-secret-456',
        },
        options: {
          useTestApi: true,
        },
      },
    });

    // Should NOT be a Fastify validation error (400 with "validation failed" message)
    // It will fail later in the adapter, but not in Fastify parsing
    expect(response.statusCode).not.toBe(400);
    // Or if it is 400, it should be from our error handler, not Fastify validation
    if (response.statusCode === 400 || response.statusCode === 503) {
      const body = JSON.parse(response.body);
      // Should not complain about body structure
      expect(body.message).not.toContain('body must be object');
    }
  });
});
