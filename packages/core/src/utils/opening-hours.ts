/**
 * Opening Hours Utilities
 *
 * Canonical opening-hours representation shared across all carrier adapters.
 *
 * Recommended format for `PickupPoint.openingHours`:
 *
 * ```ts
 * {
 *   Monday:    "08:00 - 18:00",
 *   Tuesday:   "08:00 - 18:00",
 *   // ...
 *   Saturday:  "09:00 - 14:00, 15:00 - 18:00",  // split shift / lunch break
 *   // closed days omitted entirely
 * }
 * ```
 *
 * Conventions:
 * - Keys are full English weekday names (`Monday`..`Sunday`).
 * - Values are 24-hour intervals `"HH:MM - HH:MM"`.
 * - Multiple intervals in one day are joined with `", "`.
 * - Closed days are omitted (no `null`, no empty string).
 * - When no day is open, `openingHours` is `undefined`.
 */

/** Ordered list of canonical English weekday names. */
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type WeekdayName = typeof WEEKDAY_NAMES[number];

/**
 * Maps Hungarian weekday names (accented or plain ASCII, any case) to the
 * canonical English weekday name. Used by carriers that report hours in
 * Hungarian (e.g. MPL PartnerExtra, Foxpost).
 */
const HUNGARIAN_DAY_NAMES: Record<string, WeekdayName> = {
  hétfő: 'Monday',
  hétfo: 'Monday',
  hetfo: 'Monday',
  kedd: 'Tuesday',
  szerda: 'Wednesday',
  csütörtök: 'Thursday',
  csutortok: 'Thursday',
  csütörtökön: 'Thursday',
  péntek: 'Friday',
  pentek: 'Friday',
  szombat: 'Saturday',
  vasárnap: 'Sunday',
  vasarnap: 'Sunday',
};

/**
 * Normalize a Hungarian weekday name to the canonical English name.
 *
 * @param day Hungarian weekday name (case-insensitive)
 * @returns English weekday name, or undefined when unrecognized
 */
export function normalizeHungarianDayName(day: string | undefined): WeekdayName | undefined {
  if (!day) return undefined;
  return HUNGARIAN_DAY_NAMES[day.trim().toLowerCase()];
}

/**
 * Normalize a single open interval "HH:MM - HH:MM".
 */
export function formatOpenInterval(from: string, to: string): string {
  return `${from} - ${to}`;
}

const TIME_RANGE_PATTERN = /^\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*$/;

/**
 * Parse a free-form "from-to" time range string (e.g. `"08:00-18:00"`,
 * `"8:00-18:00"`, `"08:00 - 18:00"`) into normalized `HH:MM` endpoints.
 *
 * @param value Raw time range string
 * @returns Normalized `{ from, to }`, or undefined when unparseable
 */
export function normalizeTimeRange(value: string): { from: string; to: string } | undefined {
  if (!value) return undefined;

  const match = TIME_RANGE_PATTERN.exec(value);
  if (!match) return undefined;

  const pad = (part: string) => part.padStart(2, '0');
  return { from: `${pad(match[1])}:${match[2]}`, to: `${pad(match[3])}:${match[4]}` };
}

/**
 * Build the canonical opening-hours map from per-day interval lists.
 *
 * @param entries Mapping of English weekday name to open intervals.
 *   Days without intervals, or with undefined/empty values, are omitted.
 * @returns Canonical opening-hours map keyed by weekday, or undefined when
 *   no day has a usable interval.
 */
export function buildOpeningHours(
  entries: Record<string, Array<{ from: string; to: string }> | undefined>,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};

  for (const day of WEEKDAY_NAMES) {
    const intervals = entries[day];
    if (!intervals || intervals.length === 0) continue;

    const formatted = intervals
      .filter((interval) => interval && interval.from && interval.to)
      .map((interval) => formatOpenInterval(interval.from, interval.to));

    if (formatted.length === 0) continue;
    result[day] = formatted.join(', ');
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
