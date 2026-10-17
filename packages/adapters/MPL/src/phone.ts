/**
 * The phone numbers MPL's API takes.
 *
 * Checked against the MPL SANDBOX on 2026-10-17 (about 30 requests). The
 * documentation says the number "must be Hungarian, in E.164 format" and at most 14
 * characters, but the API only enforces the LENGTH: `+36 20 123 4567` (spaces and
 * dashes count) and any value over 14 characters are refused (error 103, "length of
 * field is invalid", SHO-181), while national forms, landlines, foreign numbers and even
 * an empty or a missing phone were accepted.
 *
 * So the adapter does what keeps a number inside that limit without changing what it
 * means: it removes the separators people type (spaces, dashes, dots, parentheses),
 * and writes the `00` exit prefix and the Hungarian `06` as `+` and `+36`. It does not
 * judge whether the number is Hungarian or a mobile one, because MPL does not.
 */

export type MplPhoneResult = { ok: true; phone: string } | { ok: false; reason: 'too-long' };

/** MPL's `Contact.phone` limit, in characters. */
export const MPL_PHONE_MAX_LENGTH = 14;

export function normalizeMplPhone(phone: string): MplPhoneResult {
  let compact = phone.trim().replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  else if (compact.startsWith('06')) compact = `+36${compact.slice(2)}`;
  return compact.length > MPL_PHONE_MAX_LENGTH ? { ok: false, reason: 'too-long' } : { ok: true, phone: compact };
}
