/**
 * Utility functions for adapters
 */

export { serializeForLog, truncateString, sanitizeHeadersForLog, errorToLog } from './logging.js';
export { withOperationName, withCallTracing, composeAdapterWrappers } from './adapter-wrapper.js';
export {
  WEEKDAY_NAMES,
  formatOpenInterval,
  buildOpeningHours,
  normalizeHungarianDayName,
  normalizeTimeRange,
} from './opening-hours.js';
export type { WeekdayName } from './opening-hours.js';

