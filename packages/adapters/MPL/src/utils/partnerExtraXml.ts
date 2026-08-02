/**
 * MPL PartnerExtra XML Parsing Utilities
 *
 * Parses the public PartnerExtra pickup-points feed
 * (https://httpmegosztas.posta.hu/PartnerExtra/Out/PostInfo.xml) into
 * structured JS objects.
 *
 * The feed uses Hungarian locale number formatting: coordinates use a comma
 * as the decimal separator (e.g. "48,028436"). This module normalizes those
 * values into IEEE-754 numbers.
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { buildOpeningHours, normalizeHungarianDayName } from '@shopickup/core';
import type { PartnerExtraPost, PartnerExtraPostInfo, PartnerExtraWorkingHoursDay } from '../validation.js';

const PARTNER_EXTRA_XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

/**
 * Parse a PartnerExtra XML document into its root postInfo structure.
 *
 * Throws on malformed XML so callers can surface a permanent error.
 *
 * @param xml Raw XML document body
 * @returns Parsed postInfo structure (undefined-safe)
 */
export function parsePartnerExtraPostInfo(xml: string): PartnerExtraPostInfo {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const err = validation?.err;
    const detail = err ? `${err.code} at line ${err.line}, col ${err.col}: ${err.msg}` : 'unknown XML validation error';
    throw new Error(`Invalid XML: ${detail}`);
  }
  const parsed = PARTNER_EXTRA_XML_PARSER.parse(xml);
  return (parsed?.postInfo ?? {}) as PartnerExtraPostInfo;
}

/**
 * Normalize a value that may be a single element or an array into an array.
 */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Extract the list of <post> entries from a parsed postInfo structure.
 * Repeated elements may parse as a single object or an array.
 */
export function extractPartnerExtraPosts(postInfo: PartnerExtraPostInfo): PartnerExtraPost[] {
  return asArray(postInfo.post);
}

/**
 * Extract the list of working-hours <days> entries from a <post>.
 * Repeated elements may parse as a single object or an array.
 */
export function extractPartnerExtraWorkingHoursDays(
  post: PartnerExtraPost,
): PartnerExtraWorkingHoursDay[] {
  return asArray(post.workingHours?.days);
}

/**
 * Parse a Hungarian-locale decimal string (comma separator) into a number.
 *
 * Returns undefined for missing, empty, or unparseable values.
 */
export function parseHungarianDecimal(value: string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().replace(',', '.');
  if (normalized === '') return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Maps Hungarian weekday names to canonical English day names (GLS-compatible).
 * Day names in the PartnerExtra feed are localized per `workingHours/@culture`.
 */
function normalizeDayName(day: string | undefined): string | undefined {
  return normalizeHungarianDayName(day);
}

/**
 * Normalize the raw PartnerExtra working-hours entries into the canonical
 * `Record<string, string>` shape shared across carriers (see
 * `buildOpeningHours` in `@shopickup/core`):
 *
 *   { Monday: "08:00 - 10:00", Tuesday: "08:00 - 12:00, 13:00 - 15:00" }
 *
 * A day with a second interval (From2/To2) is joined with ", ".
 * Days that are closed, or days with unparseable names, are omitted.
 *
 * @param days Raw working-hours entries from the feed
 * @returns Canonical opening-hours map keyed by English day name
 */
export function normalizePartnerExtraWorkingHours(
  days: PartnerExtraWorkingHoursDay[],
): Record<string, string> | undefined {
  const entries: Record<string, Array<{ from: string; to: string }>> = {};

  for (const entry of days) {
    const dayName = normalizeDayName(entry.day);
    if (!dayName) continue;

    const intervals: Array<{ from: string; to: string }> = [];
    if (entry.From1 && entry.To1) intervals.push({ from: entry.From1, to: entry.To1 });
    if (entry.From2 && entry.To2) intervals.push({ from: entry.From2, to: entry.To2 });

    if (intervals.length > 0) entries[dayName] = intervals;
  }

  return buildOpeningHours(entries);
}
