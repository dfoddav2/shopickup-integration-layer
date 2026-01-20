export const httpClient = {
  async get(url: string, options?: { headers?: Record<string,string>, responseType?: 'json'|'arraybuffer' }) {
    console.log('[HTTP Client] GET', url, { headers: options?.headers });
    const res = await fetch(url, { method: 'GET', headers: options?.headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (options?.responseType === 'arraybuffer') return await res.arrayBuffer();
    return await res.json();
  },
  async post(url: string, data?: any, options?: { headers?: Record<string,string>, responseType?: 'json'|'arraybuffer' }) {
    const headers = { 'content-type': 'application/json', ...(options?.headers || {}) };
    const body = data !== undefined ? JSON.stringify(data) : undefined;
    console.log('[HTTP Client] POST', url, {
      headers,
      bodyLength: body?.length,
      bodyPreview: body?.substring(0, 200),
      dataType: typeof data,
      isArray: Array.isArray(data)
    });
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (options?.responseType === 'arraybuffer') return await res.arrayBuffer();
    return await res.json();
  },
  async put(url: string, data?: any, options?: { headers?: Record<string,string>, responseType?: 'json'|'arraybuffer' }) {
    const headers = { 'content-type': 'application/json', ...(options?.headers || {}) };
    const body = data !== undefined ? JSON.stringify(data) : undefined;
    console.log('[HTTP Client] PUT', url, { headers, bodyLength: body?.length });
    const res = await fetch(url, { method: 'PUT', headers, body });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (options?.responseType === 'arraybuffer') return await res.arrayBuffer();
    return await res.json();
  },
  async patch(url: string, data?: any, options?: { headers?: Record<string,string>, responseType?: 'json'|'arraybuffer' }) {
    const headers = { 'content-type': 'application/json', ...(options?.headers || {}) };
    const body = data !== undefined ? JSON.stringify(data) : undefined;
    console.log('[HTTP Client] PATCH', url, { headers, bodyLength: body?.length });
    const res = await fetch(url, { method: 'PATCH', headers, body });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (options?.responseType === 'arraybuffer') return await res.arrayBuffer();
    return await res.json();
  },
  async delete(url: string, options?: { headers?: Record<string,string>, responseType?: 'json'|'arraybuffer' }) {
    console.log('[HTTP Client] DELETE', url, { headers: options?.headers });
    const res = await fetch(url, { method: 'DELETE', headers: options?.headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (options?.responseType === 'arraybuffer') return await res.arrayBuffer();
    return await res.json();
  }
};