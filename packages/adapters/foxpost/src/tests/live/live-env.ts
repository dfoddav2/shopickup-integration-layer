import { FoxpostAdapter } from '../../index.js';
import type { AdapterContext, HttpClient } from '@shopickup/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type FoxpostLiveConfig =
  | {
      enabled: true;
      adapter: FoxpostAdapter;
      context: AdapterContext;
      credentials: {
        apiKey: string;
        basicUsername: string;
        basicPassword: string;
      };
      baseUrl: string;
      useTestApi: boolean;
      pickupPointId: string;
    }
  | {
      enabled: false;
      reason: string;
    };

function createFetchHttpClient(): HttpClient {
  function normalizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers) return undefined;

    const normalized: Record<string, string> = {};
    let hasContentType = false;

    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'content-type') {
        if (hasContentType) continue;
        hasContentType = true;
        normalized['Content-Type'] = value;
        continue;
      }

      normalized[key] = value;
    }

    return normalized;
  }

  async function readBody(response: Response, options?: any): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/pdf') || options?.responseType === 'arraybuffer') {
      return Buffer.from(await response.arrayBuffer());
    }

    const text = await response.text();
    if (!text) return '';

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function traceRequest(method: string, url: string, body: unknown, options?: any): void {
    console.log('Foxpost live request', {
      method,
      url,
      responseType: options?.responseType,
      headers: options?.headers,
      body,
    });
  }

  function traceResponse(method: string, url: string, status: number, headers: Record<string, string>, body: unknown): void {
    console.log('Foxpost live response', {
      method,
      url,
      status,
      headers,
      body,
    });
  }

  async function buildResponse<T>(response: Response, options?: any): Promise<T> {
    const body = await readBody(response, options);
    const normalized = {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    } as T;

    traceResponse('HTTP', response.url, response.status, Object.fromEntries(response.headers.entries()), body);

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} ${response.statusText}`);
      (error as any).response = {
        status: response.status,
        data: body,
        headers: Object.fromEntries(response.headers.entries()),
      };
      (error as any).status = response.status;
      throw error;
    }

    return normalized;
  }

  return {
    async get<T>(url: string, options?: any): Promise<T> {
      traceRequest('GET', url, undefined, options);
      const response = await fetch(url, {
        method: 'GET',
        headers: normalizeHeaders(options?.headers),
      });
      return buildResponse<T>(response, options);
    },
    async post<T>(url: string, data?: any, options?: any): Promise<T> {
      traceRequest('POST', url, data, options);
      const response = await fetch(url, {
        method: 'POST',
        headers: normalizeHeaders({
          ...options?.headers,
          ...(data !== undefined && !Object.keys(options?.headers ?? {}).some((key) => key.toLowerCase() === 'content-type')
            ? { 'Content-Type': 'application/json' }
            : {}),
        }),
        body: data !== undefined ? JSON.stringify(data) : undefined,
      });
      return buildResponse<T>(response, options);
    },
    async put<T>(): Promise<T> {
      throw new Error('PUT not implemented');
    },
    async patch<T>(): Promise<T> {
      throw new Error('PATCH not implemented');
    },
    async delete<T>(url: string, options?: any): Promise<T> {
      traceRequest('DELETE', url, undefined, options);
      const response = await fetch(url, {
        method: 'DELETE',
        headers: normalizeHeaders(options?.headers),
      });
      return buildResponse<T>(response, options);
    },
  };
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export function getFoxpostLiveConfig(): FoxpostLiveConfig {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  loadEnvFile(path.join(packageRoot, '.env.live'));

  const apiKey = process.env.FOXPOST_LIVE_API_KEY;
  const basicUsername = process.env.FOXPOST_LIVE_BASIC_USERNAME;
  const basicPassword = process.env.FOXPOST_LIVE_BASIC_PASSWORD;
  const baseUrl = process.env.FOXPOST_LIVE_BASE_URL || 'https://webapi-test.foxpost.hu';
  const useTestApi = process.env.FOXPOST_LIVE_USE_TEST_API !== 'false';
  const pickupPointId = process.env.FOXPOST_LIVE_PICKUP_POINT_ID || 'hu5512';

  if (!apiKey || !basicUsername || !basicPassword) {
    return {
      enabled: false,
      reason: 'Set FOXPOST_LIVE_API_KEY, FOXPOST_LIVE_BASIC_USERNAME, and FOXPOST_LIVE_BASIC_PASSWORD to run live Foxpost tests.',
    };
  }

  const adapter = new FoxpostAdapter(baseUrl);
  const context: AdapterContext = {
    http: createFetchHttpClient(),
    logger: console,
  };

  return {
    enabled: true,
    adapter,
    context,
    credentials: {
      apiKey,
      basicUsername,
      basicPassword,
    },
    baseUrl,
    useTestApi,
    pickupPointId,
  };
}
