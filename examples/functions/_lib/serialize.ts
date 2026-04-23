/**
 * Safely serialize objects for logging
 * Prevents circular reference errors and safely handles various object types.
 */
export function serializeForLog(obj: unknown): unknown {
  const seen = new WeakSet();

  function serialize(value: unknown, depth = 0, key?: string): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

    // Handle Error instances specially to capture message/stack
    if (value instanceof Error || (value && (value as any).message && (value as any).name)) {
      const err: any = value as any;
      const out: Record<string, unknown> = {
        name: err.name,
        message: err.message,
        stack: typeof err.stack === 'string' ? err.stack.split('\n') : err.stack,
      };

      // Axios-style error: include response details if present
      if (err.response) {
        out.response = {
          status: err.response.status,
          statusText: err.response.statusText,
          headers: err.response.headers,
          data: serialize(err.response.data, depth + 1),
        };
      }

      // Include any enumerable extra fields
      for (const k of Object.keys(err)) {
        if (!(k in out)) out[k] = serialize((err as any)[k], depth + 1);
      }

      return out;
    }

    // Arrays should be handled as arrays, not mistaken for binary-like objects
    if (Array.isArray(value)) {
      return (value as Array<unknown>).map((v) => serialize(v, depth + 1));
    }

    // Handle JSON-serialized Buffer objects, e.g. { type: 'Buffer', data: [...] }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as { type?: unknown; data?: unknown }).type === 'Buffer' &&
      Array.isArray((value as { data?: unknown }).data)
    ) {
      const bytes = (value as { data: number[] }).data;
      const len = bytes.length;
      if (len <= 64) {
        return `Buffer(${len}): ${bytes.map((b: number) => b.toString(16).padStart(2, '0')).join(' ')}`;
      }
      return `[Binary: ${len} bytes]`;
    }

    // Handle binary types explicitly: Buffer, ArrayBuffer, TypedArray / ArrayBufferView
    try {
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value as any)) {
        const len = (value as any).length;
        if (len <= 64) {
          // Small buffers: show hex preview
          try {
            return `Buffer(${len}): ${Array.from(value as any).slice(0, 64).map((b: any) => (Number(b) || 0).toString(16).padStart(2, '0')).join(' ')}${len > 64 ? ' ...' : ''}`;
          } catch (_) {
            return `[Binary: ${len} bytes]`;
          }
        }
        return `[Binary: ${len} bytes]`;
      }
    } catch (_) {
      // ignore if Buffer isn't available
    }
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      const len = (value as ArrayBuffer).byteLength;
      if (len <= 64) {
        try {
          const bytes = new Uint8Array(value as ArrayBuffer);
          return `ArrayBuffer(${len}): ${Array.from(bytes).slice(0, 64).map((b: number) => b.toString(16).padStart(2, '0')).join(' ')}${len > 64 ? ' ...' : ''}`;
        } catch (_) {
          return `[Binary: ${len} bytes]`;
        }
      }
      return `[Binary: ${len} bytes]`;
    }
    // TypedArray / DataView check — be conservative: only treat as binary if there is
    // an underlying ArrayBuffer present (avoid misclassifying plain objects that
    // implement numeric properties).
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value as any)) {
      const buf = (value as any).buffer;
      if (buf instanceof ArrayBuffer) {
        const len = (value as any).byteLength ?? (value as any).length ?? 0;
        if (len <= 64) {
          try {
            const bytes = new Uint8Array(buf, (value as any).byteOffset || 0, len);
            return `TypedArray(${len}): ${Array.from(bytes).slice(0, 64).map((b: number) => b.toString(16).padStart(2, '0')).join(' ')}${len > 64 ? ' ...' : ''}`;
          } catch (_) {
            return `[Binary: ${len} bytes]`;
          }
        }
        return `[Binary: ${len} bytes]`;
      }
      // Not backed by ArrayBuffer — fall through to normal object serialization
    }

    if (typeof value !== 'object') return String(value);

    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);

    // Limit depth to avoid massive traversal
    if (depth > 6) {
      if (Array.isArray(value)) return `[Array: ${value.length} items]`;
      return `[Object: ${Object.keys(value as object).length} keys]`;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      try {
        // If this property looks like a label or long base64 string, truncate it
        if (typeof v === 'string') {
          const lk = k.toLowerCase();
          const looksLikeBase64 = /^[A-Za-z0-9+/=\s-]{200,}$/.test(v);
          if (lk.includes('label') || lk.includes('pdf') || lk.includes('zpl') || lk.includes('base64') || looksLikeBase64) {
            const max = 200;
            const s = v as string;
            if (s.length > max) {
              out[k] = `${s.slice(0, 120)}... [truncated ${s.length} chars]`;
              continue;
            }
          }
        }

        out[k] = serialize(v, depth + 1, k);
      } catch (e) {
        out[k] = `[Unserializable: ${(e as Error).message}]`;
      }
    }
    return out;
  }

  try {
    return serialize(obj, 0);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'unknown error';
    return `[Unserializable object: ${errorMsg}]`;
  }
}
