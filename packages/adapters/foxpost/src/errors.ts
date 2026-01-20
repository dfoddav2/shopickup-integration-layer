import axios from "axios";
import { CarrierError } from "@shopickup/core";

/**
 * Foxpost-specific error code translations
 */
const FoxpostErrorCodes: Record<string, { category: string; message: string }> =
{
  WRONG_USERNAME_OR_PASSWORD: {
    category: "Auth",
    message: "Invalid Foxpost credentials",
  },
  INVALID_APM_ID: {
    category: "Validation",
    message: "Invalid APM (locker) ID",
  },
  INVALID_RECIPIENT: {
    category: "Validation",
    message: "Invalid recipient information",
  },
  INVALID_ADDRESS: {
    category: "Validation",
    message: "Invalid address provided",
  },
};

/**
 * Translate Foxpost errors to structured CarrierError
 */
/**
 * Translate Foxpost errors to structured CarrierError
 */
export function translateFoxpostError(error: unknown): CarrierError {
  const anyErr = error as any;

  // Normalize raw payload from multiple possible shapes (axios, fetch, custom)
  const normalizedRaw =
    anyErr?.response?.data ??
    anyErr?.response ??
    anyErr?.data ??
    anyErr?.body ??
    anyErr?.text ??
    anyErr;

  // helper to ensure raw is attached top-level (so loggers that don't inspect meta still see it)
  const makeCE = (message: string, category: string, meta: Record<string, unknown> = {}) => {
    const mergedMeta = { ...meta, raw: meta.raw ?? normalizedRaw };
    const ce = new CarrierError(message, category as any, mergedMeta);
    // attach top-level for serializers that don't include meta
    (ce as any).raw = mergedMeta.raw;
    return ce;
  };

  // 1) Axios-style errors (if still present)
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as Record<string, unknown> | undefined;
    const errorCode = (data?.error as string) || (data?.code as string) || `HTTP_${status}`;
    const errorMapping = FoxpostErrorCodes[errorCode];

    if (status === 400) {
      return makeCE(
        `Validation error: ${errorMapping?.message || data?.error || "Bad request"}`,
        "Validation",
        { carrierCode: errorCode, raw: data ?? error.response }
      );
    } else if (status === 401 || status === 403) {
      return makeCE("Foxpost credentials invalid", "Auth", {
        carrierCode: errorCode,
        raw: data ?? error.response,
      });
    } else if (status === 429) {
      return makeCE("Foxpost rate limit exceeded", "RateLimit", {
        retryAfterMs: 60000,
        carrierCode: errorCode,
        raw: data ?? error.response,
      });
    } else if (status && status >= 500) {
      return makeCE("Foxpost server error", "Transient", {
        carrierCode: errorCode,
        raw: data ?? error.response,
      });
    }
  }

  // 2) Fetch-style or generic HTTP errors:
  const status = anyErr?.response?.status ?? anyErr?.status;
  const responseLikeBody =
    anyErr?.response?.data ?? anyErr?.data ?? anyErr?.body ?? anyErr?.response;
  const errorCode =
    (responseLikeBody && (responseLikeBody.error || responseLikeBody.code)) ||
    (typeof status === "number" ? `HTTP_${status}` : undefined);
  const errorMapping = errorCode ? FoxpostErrorCodes[errorCode as string] : undefined;

  if (typeof status === "number") {
    if (status === 400) {
      return makeCE(
        `Validation error: ${errorMapping?.message || (responseLikeBody && responseLikeBody.error) || "Bad request"}`,
        "Validation",
        { carrierCode: errorCode, raw: responseLikeBody ?? anyErr }
      );
    } else if (status === 401 || status === 403) {
      return makeCE("Foxpost credentials invalid", "Auth", {
        carrierCode: errorCode,
        raw: responseLikeBody ?? anyErr,
      });
    } else if (status === 429) {
      return makeCE("Foxpost rate limit exceeded", "RateLimit", {
        retryAfterMs: 60000,
        carrierCode: errorCode,
        raw: responseLikeBody ?? anyErr,
      });
    } else if (status >= 500) {
      return makeCE("Foxpost server error", "Transient", {
        carrierCode: errorCode,
        raw: responseLikeBody ?? anyErr,
      });
    }
  }

  // 3) Network / other Error instances
  if (error instanceof Error) {
    // include normalizedRaw so fetch wrappers that only provide status/message still expose response
    return makeCE(`Foxpost connection error: ${error.message}`, "Transient", { raw: normalizedRaw });
  }

  // 4) Fallback
  return makeCE("Unknown Foxpost error", "Permanent", { raw: normalizedRaw });
}