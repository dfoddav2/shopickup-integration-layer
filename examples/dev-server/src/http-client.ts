export const httpClient = {
  async get(url: string, options?: { headers?: Record<string,string>, responseType?: 'json'|'arraybuffer' }) {
    const res = await fetch(url, { method: 'GET', headers: options?.headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (options?.responseType === 'arraybuffer') return await res.arrayBuffer();
    return await res.json();
  },
  async post(url: string, data?: any, options?: { headers?: Record<string,string>, responseType?: 'json'|'arraybuffer' }) {
    const headers = { 'content-type': 'application/json', ...(options?.headers || {}) };
    const body = data !== undefined ? JSON.stringify(data) : undefined;
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (options?.responseType === 'arraybuffer') return await res.arrayBuffer();
    return await res.json();
  }
};