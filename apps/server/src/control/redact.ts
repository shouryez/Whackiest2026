/**
 * PII redaction (plan.md Section 6.3). Runs on every transcript, memory, tool argument
 * and audit entry BEFORE anything is stored. Replaces matches with [REDACTED:<type>].
 *
 * Order matters: context-based patterns (OTP, bank account) run first so a 6-digit OTP
 * is labelled "otp" rather than being missed, then fixed-shape IDs.
 */

export type PiiType = "otp" | "aadhaar" | "pan" | "card" | "bank_account" | "ifsc" | "upi_pin";

const tag = (t: PiiType) => `[REDACTED:${t}]`;

// Keywords in English, Hindi (Devanagari + romanised) and Kannada.
const OTP_WORDS = [
  "otp", "o\\.t\\.p", "one time password", "code", "pin", "verification", "password",
  "ओटीपी", "कोड", "पिन", "पासवर्ड",
  "ಒಟಿಪಿ", "ಕೋಡ್", "ಪಿನ್", "ಪಾಸ್ವರ್ಡ್",
];
const ACCOUNT_WORDS = [
  "account", "a/c", "acct", "bank", "khata", "khaata",
  "खाता", "खाते", "बैंक",
  "ಖಾತೆ", "ಬ್ಯಾಂಕ್",
];

// Digits may be spoken/written with spaces or dashes between groups.
const DIGIT_RUN = (min: number, max: number) => `(?:\\d[\\s-]?){${min - 1},${max - 1}}\\d`;

// Unicode-aware "word boundary" on the left: not preceded by a letter/digit.
const LB = "(?<![\\p{L}\\p{N}_])";
const RB = "(?![\\p{L}\\p{N}_])";

function nearKeyword(words: string[], min: number, max: number, gapWords = 5): RegExp {
  const kw = `(?:${words.join("|")})`;
  const gap = `(?:[^\\d\\n]{0,40}?)`; // up to ~5 short words, no digits in between
  void gapWords;
  // keyword … digits   OR   digits … keyword
  return new RegExp(
    `${LB}(${kw})(${gap})(${DIGIT_RUN(min, max)})${RB}|${LB}(${DIGIT_RUN(min, max)})(${gap})(${kw})${RB}`,
    "giu",
  );
}

const OTP_RE = nearKeyword(OTP_WORDS, 4, 8);
const ACCOUNT_RE = nearKeyword(ACCOUNT_WORDS, 9, 18);
const AADHAAR_RE = new RegExp(`${LB}\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}${RB}`, "gu");
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/gi;
const IFSC_RE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi;
const CARD_RE = new RegExp(`${LB}${DIGIT_RUN(13, 19)}${RB}`, "gu");

function replaceNear(text: string, re: RegExp, type: PiiType): string {
  return text.replace(re, (...m: string[]) => {
    // Groups: 1 kw, 2 gap, 3 digits | 4 digits, 5 gap, 6 kw
    if (m[1] !== undefined) return `${m[1]}${m[2]}${tag(type)}`;
    return `${tag(type)}${m[5]}${m[6]}`;
  });
}

export function redactPII(input: string): string {
  if (!input) return input;
  let t = input;
  t = replaceNear(t, OTP_RE, "otp");
  t = replaceNear(t, ACCOUNT_RE, "bank_account");
  t = t.replace(CARD_RE, tag("card")); // before Aadhaar: a 16-digit card contains a 12-digit run
  t = t.replace(AADHAAR_RE, tag("aadhaar"));
  t = t.replace(IFSC_RE, tag("ifsc"));
  t = t.replace(PAN_RE, tag("pan"));
  return t;
}

const ID_KEY = /(^|_)id$|[a-z]Id$/;

/** Deep-redact every string inside an object (tool args, audit payloads). */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redactPII(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Our own identifiers (call_id, elderId, memory_id …) are not PII and must stay matchable.
      out[k] = ID_KEY.test(k) && typeof v === "string" ? v : redactDeep(v);
    }
    return out as T;
  }
  return value;
}

export function containsPII(input: string): boolean {
  return redactPII(input) !== input;
}
