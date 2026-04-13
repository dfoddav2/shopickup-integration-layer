import type { HttpClient, HttpClientConfig, HttpResponse } from '../interfaces/http-client.js';
import type { Logger } from '../interfaces/logger.js';
import { HttpError } from './errors.js';

export interface FetchHttpClientOptions {
  defaultTimeoutMs?: number;
  // fetchFn can be provided for environments where `fetch` is not global
  fetchFn?: typeof fetch;
  debug?: boolean;
  debugFullBody?: boolean;
  debugMaxBodyLength?: number;
  logger?: Logger;
}

function parseResponseText(text: string) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function makeError(status: number, statusText: string, data: unknown, headers: Record<string, string> | undefined): HttpError {
  return new HttpError(`${status} ${statusText}`, {
    status,
    response: { status, statusText, data, headers },
  });
}

function defaultLogger(): Logger {
  return {
    debug: (m: string, meta?: Record<string, unknown>) => console.debug('[http][debug]', m, meta),
    info: (m: string, meta?: Record<string, unknown>) => console.info('[http][info]', m, meta),
    warn: (m: string, meta?: Record<string, unknown>) => console.warn('[http][warn]', m, meta),
    error: (m: string, meta?: Record<string, unknown>) => console.error('[http][error]', m, meta),
  };
}

function sanitizeHeaders(headers?: Record<string, any>) {
  if (!headers) return undefined;
  const maskedKeys = ['authorization', 'api-key', 'x-api-key', 'password', 'token'];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (maskedKeys.includes(lk)) out[k] = 'REDACTED';
    else out[k] = String(v);
  }
  return out;
}

function isBinaryResponseType(responseType?: HttpClientConfig['responseType']) {
  return responseType === 'arraybuffer' || responseType === 'binary';
}

function encodeRequestBody(data: unknown): unknown {
  if (data === undefined || data === null) return undefined;
  if (typeof data === 'string') return data;
  if (data instanceof URLSearchParams) return data.toString();
  if (data instanceof Uint8Array) return data;
  const FormDataCtor = (globalThis as any).FormData;
  const BlobCtor = (globalThis as any).Blob;
  if (FormDataCtor && data instanceof FormDataCtor) return data;
  if (BlobCtor && data instanceof BlobCtor) return data;
  return JSON.stringify(data);
}

function bodyLength(body: unknown): number {
  if (body === undefined) return 0;
  if (typeof body === 'string') return body.length;
  if (body instanceof Uint8Array) return body.byteLength;
  return String(body).length;
}

function previewBody(body: unknown, maxLen = 200): string | undefined {
  if (typeof body === 'string') {
    return Number.isFinite(maxLen) ? body.slice(0, maxLen) : body;
  }

  if (body instanceof Uint8Array) {
    return undefined;
  }

  if (body && typeof body === 'object') {
    try {
      const serialized = JSON.stringify(body);
      return Number.isFinite(maxLen) ? serialized.slice(0, maxLen) : serialized;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function readResponseBody<T>(res: Response, config?: HttpClientConfig): Promise<T> {
  const responseType = config?.responseType;
  const contentType = res.headers.get('content-type') || '';

  if (isBinaryResponseType(responseType)) {
    return (new Uint8Array(await res.arrayBuffer()) as unknown) as T;
  }

  const text = await res.text();

  if (responseType === 'text') {
    return text as unknown as T;
  }

  if (responseType === 'json' || contentType.includes('application/json')) {
    return parseResponseText(text) as T;
  }

  return text as unknown as T;
}

function debugResponse(log: Logger, method: string, url: string, status: number, headers: Record<string, string>, body: unknown, resolvedFull: boolean, maxLen: number) {
  const payload: Record<string, unknown> = {
    method,
    url,
    status,
    headers: sanitizeHeaders(headers),
  };

  if (body instanceof Uint8Array) {
    payload.bodyLength = body.byteLength;
  } else if (resolvedFull) {
    payload.bodyPreview = previewBody(body, maxLen);
  }

  log.debug('response', payload);
}

export function createFetchHttpClient(opts: FetchHttpClientOptions = {}): HttpClient {
  const fetchFn = opts.fetchFn ?? (globalThis as any).fetch;
  if (!fetchFn) throw new Error('fetch is not available in this environment; provide fetchFn');

  const resolvedDebug = opts.debug ?? (process.env.HTTP_DEBUG === '1');
  const resolvedFull = opts.debugFullBody ?? false;
  const resolvedMaxBodyLength = opts.debugMaxBodyLength ?? 200;
  const log = opts.logger ?? defaultLogger();

  function toHeaders(h?: Record<string, string>) {
    return h ? Object.fromEntries(Object.entries(h)) : undefined;
  }

  async function handleResponse<T>(method: string, url: string, res: Response, config?: HttpClientConfig): Promise<HttpResponse<T>> {
    const responseHeaders = Object.fromEntries(res.headers) as Record<string, string>;

    if (!res.ok) {
      const errorText = await res.text();
      if (resolvedDebug) {
        debugResponse(log, method, url, res.status, responseHeaders, errorText, resolvedFull, resolvedMaxBodyLength);
      }
      throw makeError(res.status, res.statusText, parseResponseText(errorText), responseHeaders);
    }

    const body = await readResponseBody<T>(res, config);

    if (resolvedDebug) {
      debugResponse(log, method, url, res.status, responseHeaders, body, resolvedFull, resolvedMaxBodyLength);
    }

    return {
      status: res.status,
      headers: responseHeaders as Record<string, string | string[]>,
      body,
      ...(config?.captureRequest && { request: { method, url } }),
    };
  }

  return {
     async get<T = unknown>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>> {
       const headers = toHeaders(config?.headers);
       const params = config?.params;
       const query = params ? '?' + new URLSearchParams(Object.entries(params as Record<string,string>)).toString() : '';
       if (resolvedDebug) log.debug('request', { method: 'GET', url, headers: sanitizeHeaders(headers) });
       const res = await fetchFn(url + query, { method: 'GET', headers });
       return handleResponse<T>('GET', url, res, config);
     },

      async post<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
        const headers = toHeaders(config?.headers) ?? { 'Content-Type': 'application/json' };
        const body = encodeRequestBody(data);
        if (resolvedDebug) log.debug('request', { method: 'POST', url, headers: sanitizeHeaders(headers), bodyLength: bodyLength(body), bodyPreview: resolvedFull ? previewBody(body, resolvedMaxBodyLength) : undefined });
        const res = await fetchFn(url, { method: 'POST', headers, body });
        return handleResponse<T>('POST', url, res, config);
      },

      async put<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
        const headers = toHeaders(config?.headers) ?? { 'Content-Type': 'application/json' };
        const body = encodeRequestBody(data);
        if (resolvedDebug) log.debug('request', { method: 'PUT', url, headers: sanitizeHeaders(headers), bodyLength: bodyLength(body), bodyPreview: resolvedFull ? previewBody(body, resolvedMaxBodyLength) : undefined });
        const res = await fetchFn(url, { method: 'PUT', headers, body });
        return handleResponse<T>('PUT', url, res, config);
      },

      async patch<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
        const headers = toHeaders(config?.headers) ?? { 'Content-Type': 'application/json' };
        const body = encodeRequestBody(data);
        if (resolvedDebug) log.debug('request', { method: 'PATCH', url, headers: sanitizeHeaders(headers), bodyLength: bodyLength(body), bodyPreview: resolvedFull ? previewBody(body, resolvedMaxBodyLength) : undefined });
        const res = await fetchFn(url, { method: 'PATCH', headers, body });
        return handleResponse<T>('PATCH', url, res, config);
      },

     async delete<T = unknown>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>> {
       const headers = toHeaders(config?.headers);
       if (resolvedDebug) log.debug('request', { method: 'DELETE', url, headers: sanitizeHeaders(headers) });
       const res = await fetchFn(url, { method: 'DELETE', headers });
       return handleResponse<T>('DELETE', url, res, config);
     },
  };
}

export default createFetchHttpClient;
