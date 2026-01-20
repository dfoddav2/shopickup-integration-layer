import type { HttpClient, HttpClientConfig } from '../interfaces/http-client.js';
import type { Logger } from '../interfaces/logger.js';

export interface FetchHttpClientOptions {
  defaultTimeoutMs?: number;
  // fetchFn can be provided for environments where `fetch` is not global
  fetchFn?: typeof fetch;
  debug?: boolean;
  debugFullBody?: boolean;
  logger?: Logger;
}

function parseResponseText(text: string) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function makeError(status: number, statusText: string, data: unknown, headers: Record<string, string> | undefined) {
  const e = new Error(`${status} ${statusText}`);
  (e as any).status = status;
  (e as any).response = { status, statusText, data, headers };
  return e;
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

export function createFetchHttpClient(opts: FetchHttpClientOptions = {}): HttpClient {
  const fetchFn = opts.fetchFn ?? (globalThis as any).fetch;
  if (!fetchFn) throw new Error('fetch is not available in this environment; provide fetchFn');

  const resolvedDebug = opts.debug ?? (process.env.HTTP_DEBUG === '1');
  const resolvedFull = opts.debugFullBody ?? false;
  const log = opts.logger ?? defaultLogger();

  function toHeaders(h?: Record<string, string>) {
    return h ? Object.fromEntries(Object.entries(h)) : undefined;
  }

  return {
    async get<T = unknown>(url: string, config?: HttpClientConfig): Promise<T> {
      const headers = toHeaders(config?.headers);
      const params = config?.params;
      const query = params ? '?' + new URLSearchParams(Object.entries(params as Record<string,string>)).toString() : '';
      if (resolvedDebug) log.debug('request', { method: 'GET', url, headers: sanitizeHeaders(headers) });
      const res = await fetchFn(url + query, { method: 'GET', headers });
      const text = await res.text();
      if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(Object.fromEntries(res.headers)), bodyPreview: resolvedFull ? text.slice(0,200) : undefined });
      if (!res.ok) throw makeError(res.status, res.statusText, parseResponseText(text), Object.fromEntries(res.headers));
      const contentType = res.headers.get('content-type') || '';
      if (config && (config as any).responseType === 'arraybuffer') return (await res.arrayBuffer()) as unknown as T;
      if (contentType.includes('application/json')) return parseResponseText(text) as T;
      return text as unknown as T;
    },

    async post<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T> {
      const headers = toHeaders(config?.headers) ?? { 'Content-Type': 'application/json' };
      const body = data === undefined ? undefined : JSON.stringify(data);
      if (resolvedDebug) log.debug('request', { method: 'POST', url, headers: sanitizeHeaders(headers), bodyLength: body ? body.length : 0, bodyPreview: resolvedFull ? (body ? String(body).slice(0,200) : undefined) : undefined });
      const res = await fetchFn(url, { method: 'POST', headers, body });
      const text = await res.text();
      if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(Object.fromEntries(res.headers)), bodyPreview: resolvedFull ? text.slice(0,200) : undefined });
      if (!res.ok) throw makeError(res.status, res.statusText, parseResponseText(text), Object.fromEntries(res.headers));
      if (config && (config as any).responseType === 'arraybuffer') return (await res.arrayBuffer()) as unknown as T;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return parseResponseText(text) as T;
      return text as unknown as T;
    },

    async put<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T> {
      const headers = toHeaders(config?.headers) ?? { 'Content-Type': 'application/json' };
      const body = data === undefined ? undefined : JSON.stringify(data);
      if (resolvedDebug) log.debug('request', { method: 'PUT', url, headers: sanitizeHeaders(headers), bodyLength: body ? body.length : 0 });
      const res = await fetchFn(url, { method: 'PUT', headers, body });
      const text = await res.text();
      if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(Object.fromEntries(res.headers)) });
      if (!res.ok) throw makeError(res.status, res.statusText, parseResponseText(text), Object.fromEntries(res.headers));
      if (config && (config as any).responseType === 'arraybuffer') return (await res.arrayBuffer()) as unknown as T;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return parseResponseText(text) as T;
      return text as unknown as T;
    },

    async patch<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T> {
      const headers = toHeaders(config?.headers) ?? { 'Content-Type': 'application/json' };
      const body = data === undefined ? undefined : JSON.stringify(data);
      if (resolvedDebug) log.debug('request', { method: 'PATCH', url, headers: sanitizeHeaders(headers), bodyLength: body ? body.length : 0 });
      const res = await fetchFn(url, { method: 'PATCH', headers, body });
      const text = await res.text();
      if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(Object.fromEntries(res.headers)) });
      if (!res.ok) throw makeError(res.status, res.statusText, parseResponseText(text), Object.fromEntries(res.headers));
      if (config && (config as any).responseType === 'arraybuffer') return (await res.arrayBuffer()) as unknown as T;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return parseResponseText(text) as T;
      return text as unknown as T;
    },

    async delete<T = unknown>(url: string, config?: HttpClientConfig): Promise<T> {
      const headers = toHeaders(config?.headers);
      if (resolvedDebug) log.debug('request', { method: 'DELETE', url, headers: sanitizeHeaders(headers) });
      const res = await fetchFn(url, { method: 'DELETE', headers });
      const text = await res.text();
      if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(Object.fromEntries(res.headers)) });
      if (!res.ok) throw makeError(res.status, res.statusText, parseResponseText(text), Object.fromEntries(res.headers));
      if (config && (config as any).responseType === 'arraybuffer') return (await res.arrayBuffer()) as unknown as T;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return parseResponseText(text) as T;
      return text as unknown as T;
    },
  };
}

export default createFetchHttpClient;
