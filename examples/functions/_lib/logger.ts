// Minimal wrapper to match dev-server's wrapPinoLogger so examples don't import
// code outside the functions workspace. Keeps the examples harness self-contained.
import { serializeForLog } from './serialize.ts';
import { safeLog } from '@shopickup/core';
import { inspect } from 'util';

function formatMetaForConsole(meta: unknown) {
  if (meta === undefined || meta === null) return undefined;

  const serialized = serializeForLog(meta);
  return inspect(serialized, {
    depth: 4,
    colors: true,
    compact: false,
    sorted: true,
    maxArrayLength: 20,
    breakLength: 120,
  });
}

export function wrapPinoLogger(pinoLogger: any) {
  const baseLogger = pinoLogger || console;

  // Keep the console readable in normal runs. safeLog already applies the
  // loggingOptions truncation rules; the formatter here should not re-expand
  // the object graph with unlimited depth.
  const stringifyLogger = {
    debug: (msg: string, meta?: Record<string, unknown>) => {
      baseLogger.debug(msg, formatMetaForConsole(meta));
    },
    info: (msg: string, meta?: Record<string, unknown>) => {
      baseLogger.info(msg, formatMetaForConsole(meta));
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      baseLogger.warn(msg, formatMetaForConsole(meta));
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      baseLogger.error(msg, formatMetaForConsole(meta));
    },
  };

  // Return the stringifyLogger directly — it already serializes and prints using
  // the provided base logger (console). Avoid calling `safeLog` again here to
  // prevent recursion and double-truncation.
  return stringifyLogger;
}
