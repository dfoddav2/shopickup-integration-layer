// Minimal wrapper to match dev-server's wrapPinoLogger so examples don't import
// code outside the functions workspace. Keeps the examples harness self-contained.
import { serializeForLog } from './serialize.ts';
import { safeLog } from '@shopickup/core';
import { inspect } from 'util';

export function wrapPinoLogger(pinoLogger: any) {
  const baseLogger = pinoLogger || console;

  // Create a logger that stringifies meta before sending to console to avoid
  // Node's util.inspect truncation (shows [Object]). We still use safeLog to
  // apply truncation/summarization rules first.
  const stringifyLogger = {
    debug: (msg: string, meta?: Record<string, unknown>) => {
      const serialized = meta ? serializeForLog(meta) : undefined;
      baseLogger.debug(msg, serialized ? inspect(serialized, { depth: null, colors: true, compact: false }) : undefined);
    },
    info: (msg: string, meta?: Record<string, unknown>) => {
      const serialized = meta ? serializeForLog(meta) : undefined;
      baseLogger.info(msg, serialized ? inspect(serialized, { depth: null, colors: true, compact: false }) : undefined);
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      const serialized = meta ? serializeForLog(meta) : undefined;
      baseLogger.warn(msg, serialized ? inspect(serialized, { depth: null, colors: true, compact: false }) : undefined);
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      const serialized = meta ? serializeForLog(meta) : undefined;
      baseLogger.error(msg, serialized ? inspect(serialized, { depth: null, colors: true, compact: false }) : undefined);
    },
  };

  // Return the stringifyLogger directly — it already serializes and prints using
  // the provided base logger (console). Avoid calling `safeLog` again here to
  // prevent recursion and double-truncation.
  return stringifyLogger;
}
