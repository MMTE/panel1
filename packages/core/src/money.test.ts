import { describe, it, expect } from 'vitest';
import {
  EXPONENT,
  toMinor,
  fromMinor,
  add,
  sub,
  unknownCurrencyError,
} from './money.js';

describe('EXPONENT', () => {
  it('exposes 2-decimal currencies', () => {
    expect(EXPONENT.USD).toBe(2);
    expect(EXPONENT.EUR).toBe(2);
    expect(EXPONENT.GBP).toBe(2);
    expect(EXPONENT.CAD).toBe(2);
    expect(EXPONENT.AUD).toBe(2);
  });

  it('exposes 0-decimal currencies', () => {
    expect(EXPONENT.JPY).toBe(0);
    expect(EXPONENT.KRW).toBe(0);
    expect(EXPONENT.VND).toBe(0);
    expect(EXPONENT.CLP).toBe(0);
  });

  it('exposes 3-decimal currencies', () => {
    expect(EXPONENT.BHD).toBe(3);
    expect(EXPONENT.KWD).toBe(3);
    expect(EXPONENT.JOD).toBe(3);
  });
});

describe('toMinor', () => {
  it('converts a decimal string to minor units (EUR, 2dp)', () => {
    expect(toMinor('9.99', 'EUR')).toBe(999n);
  });

  it('converts a number to minor units (USD, 2dp)', () => {
    // Note: number input is accepted at boundaries; 9.99 as a number still
    // yields exactly 999n because conversion avoids binary-float scaling.
    expect(toMinor(9.99, 'USD')).toBe(999n);
  });

  it('handles whole-number input for a 2dp currency', () => {
    expect(toMinor('10', 'USD')).toBe(1000n);
    expect(toMinor(10, 'USD')).toBe(1000n);
  });

  it('handles zero', () => {
    expect(toMinor('0', 'USD')).toBe(0n);
    expect(toMinor('0.00', 'EUR')).toBe(0n);
  });

  it('handles negative amounts', () => {
    expect(toMinor('-9.99', 'USD')).toBe(-999n);
    expect(toMinor(-9.99, 'USD')).toBe(-999n);
  });

  it('converts a 0-decimal currency (JPY)', () => {
    expect(toMinor(1000, 'JPY')).toBe(1000n);
    expect(toMinor('1000', 'JPY')).toBe(1000n);
    // 0-decimal currencies still apply half-to-even on a fractional remainder:
    // 1000.5 is an exact half -> round to even -> 1000 (even).
    expect(toMinor('1000.5', 'JPY')).toBe(1000n);
    // 1001.5 -> exact half -> round to even -> 1002 (even).
    expect(toMinor('1001.5', 'JPY')).toBe(1002n);
    // 1000.51 -> more than half -> rounds up to 1001.
    expect(toMinor('1000.51', 'JPY')).toBe(1001n);
    // 1000.4 -> less than half -> rounds down to 1000.
    expect(toMinor('1000.4', 'JPY')).toBe(1000n);
  });

  it('converts a 3-decimal currency (BHD)', () => {
    expect(toMinor('1.234', 'BHD')).toBe(1234n);
    expect(toMinor('1.5', 'BHD')).toBe(1500n);
  });

  it('rounds half-to-even (banker rounding) at the minor boundary for USD', () => {
    // 0.125 USD: 12.5 cents -> round to even -> 12 (12 is even, 13 is odd)
    expect(toMinor('0.125', 'USD')).toBe(12n);
    // 0.135 USD: 13.5 cents -> round to even -> 14 (14 is even, 13 is odd)
    expect(toMinor('0.135', 'USD')).toBe(14n);
    // Together these two pin the rule as half-to-even (half-up would give 13 and 14).
    expect(toMinor('0.145', 'USD')).toBe(14n); // 14.5 -> 14 (even)
    expect(toMinor('0.155', 'USD')).toBe(16n); // 15.5 -> 16 (even)
  });

  it('rounds extra-precision input using half-to-even (9.999 USD -> 1000n)', () => {
    // 9.999 -> 999.9 cents -> rounds to nearest cent: 999.9 is closer to 1000 than 999,
    // so this is NOT a half case; result is 1000.
    expect(toMinor('9.999', 'USD')).toBe(1000n);
    // A genuine half at the third decimal for USD (2dp): 0.005 USD = 0.5 cents -> even -> 0
    expect(toMinor('0.005', 'USD')).toBe(0n);
    // 0.015 USD = 1.5 cents -> even -> 2
    expect(toMinor('0.015', 'USD')).toBe(2n);
  });

  it('round-trips large values without overflow (USD)', () => {
    const input = '999999999.99';
    const minor = toMinor(input, 'USD');
    expect(minor).toBe(99999999999n);
    expect(fromMinor(minor, 'USD')).toBe(input);
  });

  it('round-trips very large bigint-safe values', () => {
    const input = '123456789012345.67';
    const minor = toMinor(input, 'USD');
    expect(fromMinor(minor, 'USD')).toBe(input);
  });

  it('throws on unsupported currency', () => {
    expect(() => toMinor('1.00', 'XYZ')).toThrow(unknownCurrencyError('XYZ').message);
    expect(() => toMinor('1.00', 'xyz')).toThrow();
    expect(() => toMinor('1.00', '')).toThrow();
  });

  it('throws on non-finite number input', () => {
    expect(() => toMinor(Number.NaN, 'USD')).toThrow();
    expect(() => toMinor(Number.POSITIVE_INFINITY, 'USD')).toThrow();
    expect(() => toMinor(Number.NEGATIVE_INFINITY, 'USD')).toThrow();
  });

  it('throws on non-numeric string input', () => {
    expect(() => toMinor('abc', 'USD')).toThrow();
    expect(() => toMinor('1.0.0', 'USD')).toThrow();
    expect(() => toMinor('', 'USD')).toThrow();
  });
});

describe('fromMinor', () => {
  it('converts minor units to a decimal string (EUR)', () => {
    expect(fromMinor(999n, 'EUR')).toBe('9.99');
  });

  it('pads to the full exponent width (USD 5 -> 0.05)', () => {
    expect(fromMinor(5n, 'USD')).toBe('0.05');
    expect(fromMinor(0n, 'USD')).toBe('0.00');
    expect(fromMinor(100n, 'USD')).toBe('1.00');
  });

  it('returns a 0-decimal string for JPY', () => {
    expect(fromMinor(1000n, 'JPY')).toBe('1000');
    expect(fromMinor(0n, 'JPY')).toBe('0');
  });

  it('returns a 3-decimal string for BHD', () => {
    expect(fromMinor(1234n, 'BHD')).toBe('1.234');
    expect(fromMinor(5n, 'BHD')).toBe('0.005');
  });

  it('handles negative minor units', () => {
    expect(fromMinor(-999n, 'USD')).toBe('-9.99');
    expect(fromMinor(-5n, 'USD')).toBe('-0.05');
  });

  it('never returns a float (result is always a string with exact decimals)', () => {
    const out = fromMinor(99999999999n, 'USD');
    expect(out).toBe('999999999.99');
    expect(typeof out).toBe('string');
    // No scientific notation, no float artifacts:
    expect(out).not.toMatch(/e/i);
  });

  it('round-trips for all exponents', () => {
    const cases: Array<[string, string]> = [
      ['USD', '123.45'],
      ['EUR', '0.99'],
      ['JPY', '1234'],
      ['KRW', '1'],
      ['BHD', '1.234'],
      ['KWD', '0.001'],
    ];
    for (const [ccy, val] of cases) {
      expect(fromMinor(toMinor(val, ccy), ccy)).toBe(val);
    }
  });

  it('throws on unsupported currency', () => {
    expect(() => fromMinor(1n, 'NOPE')).toThrow();
  });
});

describe('add / sub', () => {
  it('adds two bigint minor values', () => {
    expect(add(100n, 200n)).toBe(300n);
    expect(add(-5n, 5n)).toBe(0n);
  });

  it('subtracts two bigint minor values', () => {
    expect(sub(300n, 100n)).toBe(200n);
    expect(sub(50n, 100n)).toBe(-50n);
  });

  it('is currency-agnostic (caller validates matching currency)', () => {
    // These helpers do not inspect currency at all; they are pure bigint math.
    expect(add(1n, 2n)).toBe(3n);
    expect(sub(10n, 3n)).toBe(7n);
  });
});

describe('unknownCurrencyError', () => {
  it('produces a descriptive error mentioning the code', () => {
    const err = unknownCurrencyError('XYZ');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('XYZ');
  });
});
