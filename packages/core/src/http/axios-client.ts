import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from "axios";
import type { HttpClient, HttpClientConfig } from "../interfaces/http-client.js";

import type { Logger } from '../interfaces/logger.js';

export interface AxiosHttpClientOptions {
  axiosInstance?: AxiosInstance;
  defaultTimeoutMs?: number;
  debug?: boolean;
  debugFullBody?: boolean;
  logger?: Logger;
}

/**
 * Create a HttpClient implementation backed by Axios.
 * - Normalizes errors to include `status` and `response` (with `data`).
 * - Supports `responseType: 'json'|'arraybuffer'` through config.
 */
export function createAxiosHttpClient(opts: AxiosHttpClientOptions = {}): HttpClient {
  const instance: AxiosInstance =
    opts.axiosInstance ??
    axios.create({ timeout: opts.defaultTimeoutMs ?? 30_000 });

  function toAxiosConfig(config?: HttpClientConfig): AxiosRequestConfig {
    const ac: AxiosRequestConfig = {};
    if (!config) return ac;
    if (config.headers) ac.headers = config.headers as Record<string, string>;
    if (typeof config.timeout === "number") ac.timeout = config.timeout;
    if (config.params) ac.params = config.params as Record<string, unknown>;
    // allow passing through other axios-compatible options
    for (const k of Object.keys(config)) {
      if (["headers", "timeout", "params"].includes(k)) continue;
      (ac as any)[k] = (config as any)[k];
    }
    return ac;
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


  async function handleError(err: unknown): Promise<never> {
    if ((err as AxiosError).isAxiosError) {
      const aerr = err as AxiosError;
      const e = new Error(aerr.message);
      (e as any).isAxiosError = true;
      (e as any).status = aerr.response?.status;
      (e as any).response = aerr.response
        ? {
            status: aerr.response.status,
            statusText: aerr.response.statusText,
            data: aerr.response.data,
            headers: aerr.response.headers,
          }
        : undefined;
      throw e;
    }

    // Non-axios error, rethrow as-is
    throw err;
  }

  const resolvedDebug = opts.debug ?? (process.env.HTTP_DEBUG === '1');
  const resolvedFull = opts.debugFullBody ?? false;
  const log = opts.logger ?? defaultLogger();

  const client: HttpClient = {
    async get<T = unknown>(url: string, config?: HttpClientConfig): Promise<T> {
      const ac = toAxiosConfig(config);
      if ((config as any)?.responseType === "arraybuffer") ac.responseType = "arraybuffer";
      if (resolvedDebug) log.debug('request', { method: 'GET', url, headers: sanitizeHeaders(ac.headers) });
      try {
        const res = await instance.request<T>({ method: "GET", url, ...ac });
        if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(res.headers as any), bodyPreview: resolvedFull ? (JSON.stringify(res.data).slice(0, 200)) : undefined });
        return res.data as T;
      } catch (err) {
        if (resolvedDebug) log.debug('error', { err, bodyPreview: resolvedFull ? JSON.stringify((err as any).response?.data) : undefined });
        return handleError(err) as unknown as Promise<T>;
      }
    },

    async post<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T> {
      const ac = toAxiosConfig(config);
      if ((config as any)?.responseType === "arraybuffer") ac.responseType = "arraybuffer";
      if (resolvedDebug) log.debug('request', { method: 'POST', url, headers: sanitizeHeaders(ac.headers), bodyLength: data ? JSON.stringify(data).length : 0, bodyPreview: resolvedFull ? JSON.stringify(data).slice(0,200) : undefined });
      try {
        const res = await instance.request<T>({ method: "POST", url, data, ...ac });
        if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(res.headers as any), bodyPreview: resolvedFull ? (JSON.stringify(res.data).slice(0,200)) : undefined });
        return res.data as T;
      } catch (err) {
        if (resolvedDebug) log.debug('error', { err, bodyPreview: resolvedFull ? JSON.stringify((err as any).response?.data).slice(0,200) : undefined });
        return handleError(err) as unknown as Promise<T>;
      }
    },

    async put<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T> {
      const ac = toAxiosConfig(config);
      if ((config as any)?.responseType === "arraybuffer") ac.responseType = "arraybuffer";
      if (resolvedDebug) log.debug('request', { method: 'PUT', url, headers: sanitizeHeaders(ac.headers), bodyLength: data ? JSON.stringify(data).length : 0 });
      try {
        const res = await instance.request<T>({ method: "PUT", url, data, ...ac });
        if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(res.headers as any) });
        return res.data as T;
      } catch (err) {
        if (resolvedDebug) log.debug('error', { err });
        return handleError(err) as unknown as Promise<T>;
      }
    },

    async patch<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T> {
      const ac = toAxiosConfig(config);
      if ((config as any)?.responseType === "arraybuffer") ac.responseType = "arraybuffer";
      if (resolvedDebug) log.debug('request', { method: 'PATCH', url, headers: sanitizeHeaders(ac.headers), bodyLength: data ? JSON.stringify(data).length : 0 });
      try {
        const res = await instance.request<T>({ method: "PATCH", url, data, ...ac });
        if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(res.headers as any) });
        return res.data as T;
      } catch (err) {
        if (resolvedDebug) log.debug('error', { err });
        return handleError(err) as unknown as Promise<T>;
      }
    },

    async delete<T = unknown>(url: string, config?: HttpClientConfig): Promise<T> {
      const ac = toAxiosConfig(config);
      if ((config as any)?.responseType === "arraybuffer") ac.responseType = "arraybuffer";
      if (resolvedDebug) log.debug('request', { method: 'DELETE', url, headers: sanitizeHeaders(ac.headers) });
      try {
        const res = await instance.request<T>({ method: "DELETE", url, ...ac });
        if (resolvedDebug) log.debug('response', { status: res.status, headers: sanitizeHeaders(res.headers as any) });
        return res.data as T;
      } catch (err) {
        if (resolvedDebug) log.debug('error', { err });
        return handleError(err) as unknown as Promise<T>;
      }
    },
  };

  return client;
}

export default createAxiosHttpClient;
