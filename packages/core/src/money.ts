/**
 * Money helpers for the D2 integer-minor-units accounting model.
 *
 * All money values flow through the system as `bigint` minor units (e.g. €9.99
 * is represented as `999n`) paired with an ISO-4217 currency code. Conversions
 * to and from human-readable decimal happen ONLY at boundaries (Stripe API,
 * display, user input) via {@link toMinor} and {@link fromMinor}.
 *
 * Rounding rule: {@link toMinor} uses **round-half-to-even (banker's rounding)**
 * at the minor-unit boundary. This is load-bearing for "the books reconcile to
 * the cent" because half-even avoids the systematic upward bias that half-up
 * rounding introduces over many transactions.
 *
 * Float safety: every conversion is performed with pure string / BigInt
 * integer arithmetic. We never do `Math.round(amount * 100)` — that pattern is
 * exactly the binary-float drift bug this module removes (e.g. `0.1 + 0.2` and
 * `1.005 * 100` are not what they look like in IEEE-754).
 */

/**
 * Currency code -> number of decimal places (the exponent N such that 1 major
 * unit = 10^N minor units). ISO-4217.
 *
 * - 2: USD, EUR, GBP, CAD, AUD (and most others)
 * - 0: JPY, KRW, VND, CLP (and others, e.g. ISK)
 * - 3: BHD, KWD, JOD, OMR, TND
 *
 * Any currency not listed here is rejected by the money helpers rather than
 * silently defaulted, because getting the exponent wrong corrupts every value
 * that flows through it. To support a new currency, add it here first.
 */
export const EXPONENT: Readonly<Record<string, number>> = {
  // 2-decimal (most common)
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  CHF: 2,
  HKD: 2,
  SGD: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  PLN: 2,
  CZK: 2,
  MXN: 2,
  BRL: 2,
  INR: 2,
  RUB: 2,
  CNY: 2,
  ZAR: 2,
  TRY: 2,
  AED: 2,
  SAR: 2,
  THB: 2,
  PHP: 2,
  IDR: 2,
  MYR: 2,
  RON: 2,
  BGN: 2,
  HUF: 2, // HUF is officially 2 (fillér), despite a common 0 misrepresentation
  ILS: 2,
  // 0-decimal
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  PYG: 0,
  UGX: 0,
  // 3-decimal
  BHD: 3,
  KWD: 3,
  JOD: 3,
  OMR: 3,
  TND: 3,
};

/**
 * Error thrown when a currency is not present in {@link EXPONENT}.
 * Construct via {@link unknownCurrencyError}.
 */
export class UnknownCurrencyError extends Error {
  constructor(public readonly currency: string) {
    super(
      `Unknown or unsupported currency code: "${currency}". ` +
        `Add it to EXPONENT in packages/core/src/money.ts before using it for money math.`
    );
    this.name = 'UnknownCurrencyError';
  }
}

/** Build an error for an unsupported currency code. */
export function unknownCurrencyError(currency: string): UnknownCurrencyError {
  return new UnknownCurrencyError(currency);
}

function getExponent(currency: string): number {
  const exp = EXPONENT[currency];
  if (exp === undefined) {
    throw unknownCurrencyError(currency);
  }
  return exp;
}

/**
 * A parsed decimal: sign (+1 or -1), integer digits (always at least "0",
 * digits only, no leading zeros), and fractional digits (may be "", digits
 * only).
 */
interface ParsedDecimal {
  sign: 1 | -1;
  intDigits: string;
  fracDigits: string;
}

// Accepts optional leading sign, integer digits, optional "." with digits.
// No thousands separators, no scientific notation, no surrounding junk.
const DECIMAL_STRING_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function parseDecimal(input: string): ParsedDecimal {
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new Error(`Invalid decimal amount: "${input}"`);
  }

  // Normalize a leading ".5" -> "0.5" and "-.5" -> "-0.5" for boundary inputs.
  let s = trimmed;
  if (s.startsWith('.')) {
    s = '0' + s;
  } else if (s.startsWith('-.')) {
    s = '-0' + s.slice(1);
  }

  if (!DECIMAL_STRING_RE.test(s)) {
    throw new Error(`Invalid decimal amount: "${input}"`);
  }

  let sign: 1 | -1 = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1);
  }

  let intDigits: string;
  let fracDigits: string;
  const dot = s.indexOf('.');
  if (dot === -1) {
    intDigits = s;
    fracDigits = '';
  } else {
    intDigits = s.slice(0, dot);
    fracDigits = s.slice(dot + 1);
  }

  // intDigits already matches `0|[1-9][0-9]*` thanks to the regex, so it has no
  // spurious leading zeros.

  return { sign, intDigits, fracDigits };
}

/**
 * Convert a decimal `amount` into integer minor units for the given currency.
 *
 * @example toMinor('9.99', 'EUR') === 999n
 * @example toMinor(9.99, 'USD') === 999n
 * @example toMinor(1000, 'JPY') === 1000n
 * @example toMinor('1.234', 'BHD') === 1234n
 *
 * Rounding: round-half-to-even (banker's rounding) at the minor boundary.
 *   toMinor('0.125', 'USD') === 12n   // 12.5 cents -> 12 (even)
 *   toMinor('0.135', 'USD') === 14n   // 13.5 cents -> 14 (even)
 *
 * Implementation / float-safety: the conversion uses pure string + BigInt
 * arithmetic. The numeric input path first converts the number to its shortest
 * round-tripping decimal string (`Number.prototype.toString`) and then operates
 * strictly on decimal digits, so the binary-float representation never reaches
 * the rounding step. We deliberately never call `Math.round(amount * 100)`.
 *
 * @param amount   decimal amount (number or decimal string). Numbers are
 *                 accepted for boundary convenience; for values with more than
 *                 ~15 significant digits pass a string to avoid lossy
 *                 double-precision input.
 * @param currency ISO-4217 upper-case code present in {@link EXPONENT}.
 */
export function toMinor(amount: number | string, currency: string): bigint {
  const exp = getExponent(currency);

  let decimalStr: string;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw new Error(`Cannot convert non-finite number to minor units: ${amount}`);
    }
    decimalStr = amount.toString();
  } else if (typeof amount === 'string') {
    decimalStr = amount;
  } else {
    throw new Error(`Unsupported amount type: ${typeof amount}`);
  }

  const { sign, intDigits, fracDigits } = parseDecimal(decimalStr);

  // The truncated minor value (toward zero) is the integer digits concatenated
  // with the first `exp` fractional digits, left-padded with zeros if the
  // fractional part is shorter than `exp`.
  const keptFrac = (fracDigits + '0'.repeat(exp)).slice(0, exp);
  const discarded = fracDigits.slice(exp); // digits beyond the minor boundary

  const truncatedDigits = (intDigits + keptFrac).replace(/^0+(?=\d)/, '');
  const truncatedMinor = truncatedDigits === '' ? 0n : BigInt(truncatedDigits);

  // Round half-to-even using pure digit comparison (no floats). `discarded` is
  // the fractional remainder beyond the minor boundary; its first digit's
  // place value is one-tenth of the last kept digit. Halfway is exactly a
  // leading '5' followed by all zeros.
  let roundedMinor = truncatedMinor;
  if (discarded.length > 0) {
    const firstDiscarded = discarded.charCodeAt(0) - 48; // '0'..'9' -> 0..9
    const restNonZero = discarded.slice(1).replace(/0/g, '').length > 0;
    if (firstDiscarded < 5) {
      // round toward zero (truncatedMinor unchanged)
    } else if (firstDiscarded > 5) {
      // round away from zero (magnitude +1)
      roundedMinor = truncatedMinor + 1n;
    } else {
      // firstDiscarded === 5: exact half iff the rest is all zeros
      if (restNonZero) {
        roundedMinor = truncatedMinor + 1n;
      } else if (truncatedMinor % 2n === 1n) {
        // exactly half: round to even -> bump odd up to even
        roundedMinor = truncatedMinor + 1n;
      }
      // else truncatedMinor already even -> leave it
    }
  }

  return BigInt(sign) * roundedMinor;
}

/**
 * Convert integer minor units back to a decimal **string** for the given
 * currency, formatted to the currency's exponent.
 *
 * @example fromMinor(999n, 'EUR') === '9.99'
 * @example fromMinor(1000n, 'JPY') === '1000'
 * @example fromMinor(1234n, 'BHD') === '1.234'
 *
 * Always returns a string (never a number) so float drift can never be
 * reintroduced at the display / boundary layer.
 */
export function fromMinor(minor: bigint, currency: string): string {
  const exp = getExponent(currency);
  const negative = minor < 0n;
  const magnitudeStr = (negative ? -minor : minor).toString();

  let intDigits: string;
  let fracDigits: string;
  if (exp === 0) {
    intDigits = magnitudeStr;
    fracDigits = '';
  } else if (magnitudeStr.length <= exp) {
    // Left-pad so we have at least one integer digit + exp fractional digits.
    const padded = magnitudeStr.padStart(exp + 1, '0');
    intDigits = padded.slice(0, padded.length - exp);
    fracDigits = padded.slice(padded.length - exp);
  } else {
    intDigits = magnitudeStr.slice(0, magnitudeStr.length - exp);
    fracDigits = magnitudeStr.slice(magnitudeStr.length - exp);
  }

  // Drop leading zeros from the integer part but always keep one digit.
  intDigits = intDigits.replace(/^0+(?=\d)/, '');
  if (intDigits === '') intDigits = '0';

  const body = fracDigits.length > 0 ? `${intDigits}.${fracDigits}` : intDigits;
  return negative ? `-${body}` : body;
}

/**
 * Add two minor-unit magnitudes. Pure bigint addition.
 *
 * Currency-agnostic: the caller is responsible for ensuring both operands are
 * minor units of the *same* currency. These helpers deliberately do not carry
 * currency metadata so money can be stored as bare bigint columns; mixing
 * currencies via `add`/`sub` is a caller bug and is not detected here.
 */
export function add(a: bigint, b: bigint): bigint {
  return a + b;
}

/**
 * Subtract `b` from `a`. Pure bigint subtraction. See {@link add} for the
 * same-currency contract (caller's responsibility).
 */
export function sub(a: bigint, b: bigint): bigint {
  return a - b;
}
