/**
 * Dev-server response shaping for label endpoints.
 *
 * Keeps adapter behavior in-memory and binary-first, while avoiding huge Swagger/UI payloads.
 */

const BASE64_PREVIEW_LENGTH = 160;

type SerializedBuffer = {
  type: 'Buffer';
  data: number[];
};

function isSerializedBuffer(value: unknown): value is SerializedBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as any).type === 'Buffer' &&
    Array.isArray((value as any).data)
  );
}

function toBase64Preview(value: Buffer | Uint8Array | SerializedBuffer): {
  encoding: 'base64-preview';
  byteLength: number;
  truncated: boolean;
  preview: string;
} {
  const bytes = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
    ? Buffer.from(value)
    : Buffer.from(value.data);

  const b64 = bytes.toString('base64');

  return {
    encoding: 'base64-preview',
    byteLength: bytes.byteLength,
    truncated: b64.length > BASE64_PREVIEW_LENGTH,
    preview: b64.slice(0, BASE64_PREVIEW_LENGTH),
  };
}

function sanitizeLabelHttpValue(value: unknown, keyHint?: string): unknown {
  // Special-case rawBytes: always return a compact base64 preview when present
  if (keyHint === 'rawBytes' && value != null) {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array || isSerializedBuffer(value)) {
      return toBase64Preview(value as any);
    }

    if (typeof value === 'string' && value.length > BASE64_PREVIEW_LENGTH) {
      return {
        encoding: 'base64-preview',
        byteLength: value.length,
        truncated: true,
        preview: value.slice(0, BASE64_PREVIEW_LENGTH),
      };
    }
  }

  if (typeof value === 'string') {
    if ((keyHint === 'label' || keyHint === 'labelBase64') && value.length > BASE64_PREVIEW_LENGTH) {
      return `[truncated ${keyHint}; length=${value.length}]`;
    }
    return value;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return toBase64Preview(value);
  }

  if (isSerializedBuffer(value)) {
    return toBase64Preview(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLabelHttpValue(item));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'rawBytes') {
        out[key] = nested == null ? nested : sanitizeLabelHttpValue(nested, key);
        continue;
      }
      out[key] = sanitizeLabelHttpValue(nested, key);
    }
    return out;
  }

  return value;
}

export function formatLabelResponseForHttp<T>(response: T): T {
  return sanitizeLabelHttpValue(response) as T;
}
