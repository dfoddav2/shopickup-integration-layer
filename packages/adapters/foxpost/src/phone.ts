/**
 * The recipient phone the way Foxpost's API takes it.
 *
 * Checked against the Foxpost TEST API on 2026-10-17 (about 40 requests, home
 * delivery and pickup point alike). The documentation only shows the example
 * "+36301234567"; the API is much stricter than the examples suggest:
 *
 * - accepted: `+36` or `36` (no plus) followed by 20, 30, 31, 50 or 70 and seven
 *   digits, written without spaces or dashes;
 * - refused: spaces and dashes inside the number, `06...`, `0036...`, a bare
 *   national number, `+36` followed by the trunk zero, prefix 51 (which the
 *   adapter's earlier schema allowed) and 90, landlines, other countries, too
 *   short or long numbers, letters and an empty phone.
 *
 * So a number typed in another way is NOT passed through: it is normalised to the
 * compact `+36...` form here, and one that is not a Hungarian mobile number
 * (Foxpost refuses the whole batch for it) is refused before the request. No
 * dependency; the prefixes are the Hungarian mobile numbering plan Foxpost uses.
 */

/** Hungarian mobile prefixes Foxpost accepts. */
export const FOXPOST_MOBILE_PREFIXES = ['20', '30', '31', '50', '70'] as const;

const MOBILE = new RegExp(`^(?:${FOXPOST_MOBILE_PREFIXES.join('|')})\\d{7}$`);

export type FoxpostPhoneFailure =
  /** Empty, or something other than digits, spaces, dashes, dots, parentheses and a leading plus. */
  | 'invalid-characters'
  /** An international number with another country's calling code. */
  | 'other-country'
  /** Not a Hungarian mobile number Foxpost accepts (landline, other prefix, wrong length, `+36` plus a trunk zero). */
  | 'not-mobile';

export type FoxpostPhoneResult = { ok: true; e164: string } | { ok: false; reason: FoxpostPhoneFailure };

/**
 * Normalises a recipient phone to `+36XXXXXXXXX` and checks that Foxpost will take
 * it. Accepts the common spellings: `+36 20 123 4567`, `0036...`, `36...`,
 * `06 20 123 4567` and the bare `20 123 4567`.
 */
export function normalizeFoxpostMobilePhone(phone: string): FoxpostPhoneResult {
  const text = (phone ?? '').trim();
  if (!text || /[^\d+\s().-]/.test(text) || text.lastIndexOf('+') > 0) {
    return { ok: false, reason: 'invalid-characters' };
  }
  const digits = text.replace(/\D/g, '');

  let nsn: string;
  if (text.startsWith('+') || digits.startsWith('00')) {
    const international = text.startsWith('+') ? digits : digits.slice(2);
    if (!international.startsWith('36')) return { ok: false, reason: 'other-country' };
    nsn = international.slice(2);
  } else if (digits.startsWith('06')) {
    nsn = digits.slice(2);
  } else if (digits.startsWith('36') && digits.length === 11) {
    nsn = digits.slice(2); // 36 without the plus, which Foxpost accepts as written
  } else {
    nsn = digits;
  }

  return MOBILE.test(nsn) ? { ok: true, e164: `+36${nsn}` } : { ok: false, reason: 'not-mobile' };
}

/** The reason for a refused number, worded for logs and error messages. */
export function explainFoxpostPhoneFailure(phone: string, reason: FoxpostPhoneFailure): string {
  const rule = `a Hungarian mobile number (+36 with 20, 30, 31, 50 or 70)`;
  switch (reason) {
    case 'other-country':
      return `Foxpost needs ${rule}; "${phone}" belongs to another country.`;
    case 'invalid-characters':
      return `Foxpost needs ${rule}; "${phone}" is not a valid phone number.`;
    default:
      return `Foxpost needs ${rule}; "${phone}" is not one (landlines and other prefixes are refused).`;
  }
}
