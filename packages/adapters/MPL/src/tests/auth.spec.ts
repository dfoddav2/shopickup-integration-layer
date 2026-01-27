import { describe, it, expect, beforeEach } from 'vitest';
import { exchangeAuthToken } from '../capabilities/auth.js';
import type { AdapterContext, HttpResponse } from '@shopickup/core';
import { CarrierError } from '@shopickup/core';
import type { ExchangeAuthTokenRequest } from '../validation.js';
import { createResolveOAuthUrl } from '../utils/resolveBaseUrl.js';

/**
 * Mock HTTP client for testing
 */
class MockHttpClient {
  private responses: Map<string, HttpResponse<any>> = new Map();

  setResponse(key: string, response: HttpResponse<any>): void {
    this.responses.set(key, response);
  }

  async post<T>(url: string, data: any, options?: any): Promise<HttpResponse<T>> {
    const response = this.responses.get(url);
    if (!response) {
      throw new Error(`No mock response configured for ${url}`);
    }
    return response as HttpResponse<T>;
  }

  async get<T>(url: string, options?: any): Promise<HttpResponse<T>> {
    const response = this.responses.get(url);
    if (!response) {
      throw new Error(`No mock response configured for ${url}`);
    }
    return response as HttpResponse<T>;
  }
}

/**
 * Mock logger for capturing logs
 */
class MockLogger {
  logs: any[] = [];

  debug(msg: string, data?: any): void {
    this.logs.push({ level: 'debug', msg, data });
  }

  info(msg: string, data?: any): void {
    this.logs.push({ level: 'info', msg, data });
  }

  warn(msg: string, data?: any): void {
    this.logs.push({ level: 'warn', msg, data });
  }

  error(msg: string, data?: any): void {
    this.logs.push({ level: 'error', msg, data });
  }

  getLogs(level?: string): any[] {
    return level ? this.logs.filter(l => l.level === level) : this.logs;
  }

  clear(): void {
    this.logs = [];
  }
}

describe('MPL Auth Exchange', () => {
  let httpClient: MockHttpClient;
  let logger: MockLogger;
  let accountingCode: string;
  let resolveOAuthUrl: ReturnType<typeof createResolveOAuthUrl>;

  beforeEach(() => {
    httpClient = new MockHttpClient();
    logger = new MockLogger();
    accountingCode = 'ACC-123';
    resolveOAuthUrl = createResolveOAuthUrl(
      'https://core.api.posta.hu/oauth2/token',
      'https://sandbox.api.posta.hu/oauth2/token'
    );
  });

  describe('exchangeAuthToken', () => {
    it('should successfully exchange apiKey credentials for OAuth token', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key-123',
          apiSecret: 'test-secret-456',
        },
        options: {
          useTestApi: false,
        },
      };

      const mockToken = {
        access_token: 'APRug5AE4VGAzNKDPAoxugLiDp0b',
        token_type: 'Bearer' as const,
        expires_in: 1799,
        issued_at: 1592910455065,
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: mockToken,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      const result = await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);

      expect(result.access_token).toBe('APRug5AE4VGAzNKDPAoxugLiDp0b');
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(1799);
      expect(result.issued_at).toBe(1592910455065);
      expect(result.raw).toEqual(mockToken);

      // Verify logging
      const infoLogs = logger.getLogs('info');
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(infoLogs[0].msg).toContain('successfully');
    });

    it('should use sandbox endpoint when useTestApi is true', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
        options: {
          useTestApi: true,
        },
      };

      const mockToken = {
        access_token: 'test-token-sandbox',
        token_type: 'Bearer' as const,
        expires_in: 3600,
      };

      httpClient.setResponse('https://sandbox.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: mockToken,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      const result = await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);

      expect(result.access_token).toBe('test-token-sandbox');
      expect(result.expires_in).toBe(3600);

      // Verify debug logs mention test API
      const debugLogs = logger.getLogs('debug');
      expect(debugLogs.length).toBeGreaterThan(0);
    });

    it('should throw CarrierError with Validation category when credentials are missing apiKey', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: '',
          apiSecret: 'test-secret',
        },
      };

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Validation');
        expect(error.message).toContain('Invalid request');
      }
    });

    it('should throw CarrierError with Validation category when credentials are missing apiSecret', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: '',
        },
      };

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Validation');
      }
    });

    it('should throw CarrierError when oauth2 token is passed instead of apiKey', async () => {
      const req = {
        credentials: {
          authType: 'oauth2',
          oAuth2Token: 'already-have-token',
        },
      } as any;

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Validation');
        expect(error.message).toContain('exchangeAuthToken requires apiKey credentials');
      }
    });

    it('should handle 401 Basic auth disabled error response', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const errorResponse = {
        fault: {
          faultstring: 'Basic authentication is not enabled for this proxy or client.',
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 401,
        headers: {},
        body: errorResponse,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Auth');
        expect(error.message).toContain('OAuth token exchange failed');
        expect(error.message).toContain('RaiseFault.BasicAuthNotEnabled');
      }
    });

    it('should handle 400 invalid credentials error response', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'invalid-key',
          apiSecret: 'invalid-secret',
        },
      };

      const errorResponse = {
        fault: {
          faultstring: 'Invalid API key or secret.',
          detail: {
            errorcode: 'RaiseFault.InvalidCredentials',
          },
        },
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 400,
        headers: {},
        body: errorResponse,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Auth');
        expect(error.message).toContain('Invalid API key or secret');
      }
    });

    it('should throw CarrierError when response is missing access_token', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: {
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Permanent');
        expect(error.message).toContain('missing access_token');
      }
    });

    it('should throw CarrierError when access_token is not a string', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: {
          access_token: 12345,  // Should be string
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Permanent');
        expect(error.message).toContain('access_token is not a string');
      }
    });

    it('should throw CarrierError when expires_in is not a number', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: {
          access_token: 'valid-token',
          token_type: 'Bearer',
          expires_in: '3600',  // Should be number
        },
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Permanent');
        expect(error.message).toContain('expires_in is not a number');
      }
    });

    it('should throw CarrierError with Permanent category when HTTP client is missing', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const ctx: AdapterContext = {
        // No http client
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Permanent');
        expect(error.message).toContain('HTTP client not provided');
      }
    });

    it('should default token_type to Bearer if not provided in response', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const mockToken = {
        access_token: 'test-token',
        // token_type is missing (though API usually provides it)
        expires_in: 3600,
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: mockToken,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      const result = await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);

      expect(result.token_type).toBe('Bearer');
    });

    it('should log debug message when starting token exchange', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const mockToken = {
        access_token: 'test-token',
        token_type: 'Bearer' as const,
        expires_in: 3600,
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: mockToken,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);

      const debugLogs = logger.getLogs('debug');
      expect(debugLogs.length).toBeGreaterThan(0);
      expect(debugLogs[0].msg).toContain('Exchanging');
    });

    it('should log info message after successful token exchange', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const mockToken = {
        access_token: 'test-token',
        token_type: 'Bearer' as const,
        expires_in: 1799,
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 200,
        headers: {},
        body: mockToken,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);

      const infoLogs = logger.getLogs('info');
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(infoLogs[0].msg).toContain('successfully');
      expect(infoLogs[0].data.expiresIn).toBe(1799);
    });

    it('should log warn message on OAuth error response', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const errorResponse = {
        fault: {
          faultstring: 'Authentication failed',
          detail: {
            errorcode: 'AUTH_FAILED',
          },
        },
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 401,
        headers: {},
        body: errorResponse,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
      } catch {
        // Expected to throw
      }

      const warnLogs = logger.getLogs('warn');
      expect(warnLogs.length).toBeGreaterThan(0);
      expect(warnLogs[0].msg).toContain('failed');
    });

    it('should include raw response in error for debugging', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const errorResponse = {
        fault: {
          faultstring: 'Authentication failed',
          detail: {
            errorcode: 'AUTH_FAILED',
          },
        },
      };

      httpClient.setResponse('https://core.api.posta.hu/oauth2/token', {
        status: 401,
        headers: {},
        body: errorResponse,
      });

      const ctx: AdapterContext = {
        http: httpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.raw).toBeDefined();
        expect(error.raw).toEqual(errorResponse);
      }
    });
  });

  describe('error handling', () => {
    it('should convert unknown errors to CarrierError with Transient category', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      // Simulate HTTP client throwing an error
      const brokenHttpClient = {
        post: async () => {
          throw new Error('Network timeout');
        },
      };

      const ctx: AdapterContext = {
        http: brokenHttpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const error = err as CarrierError;
        expect(error.category).toBe('Transient');
        expect(error.message).toContain('Failed to exchange OAuth token');
      }
    });

    it('should log error message when HTTP client fails', async () => {
      const req: ExchangeAuthTokenRequest = {
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const brokenHttpClient = {
        post: async () => {
          throw new Error('Connection refused');
        },
      };

      const ctx: AdapterContext = {
        http: brokenHttpClient as any,
        logger,
      };

      try {
        await exchangeAuthToken(req, ctx, resolveOAuthUrl, accountingCode);
      } catch {
        // Expected
      }

      const errorLogs = logger.getLogs('error');
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].msg).toContain('Failed to exchange');
    });
  });
});
