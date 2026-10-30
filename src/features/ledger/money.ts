/** Money is whole pence (D11): never a float, never a string in the database. */
export const MIN_PENCE = 1;
export const MAX_PENCE = 1_000_000; // £10,000.00

const AMOUNT_HINT = "Enter an amount like 4.20.";

/** £4.20, £1,000.00, -£0.01. Expects a whole number of pence. */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const absolute = Math.abs(pence);
  const pounds = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}£${pounds}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Why an amount of pence is not allowed on an expense or a payment, or null when it is fine. */
export function checkAmountPence(pence: number): string | null {
  if (!Number.isInteger(pence)) return AMOUNT_HINT;
  if (pence < MIN_PENCE) return "The amount must be at least 1p.";
  if (pence > MAX_PENCE) return `The amount can be at most ${formatPence(MAX_PENCE)}.`;
  return null;
}

export type ParsedAmount = { ok: true; pence: number } | { ok: false; message: string };

/**
 * Turns what a person typed into pence: "4", "4.2", "£12.50" and "1,234.50" are fine. More than
 * two decimal places is refused, not rounded, so nobody is quietly charged the wrong amount.
 */
export function parsePounds(input: string): ParsedAmount {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, message: "Enter an amount." };
  }
  const text = input.trim().replace(/^£\s*/, "");

  if (/^[\d,]*\.\d{3,}$/.test(text)) {
    return {
      ok: false,
      message: "Use pounds and pence, like 4.20. No more than two decimal places.",
    };
  }
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return { ok: false, message: AMOUNT_HINT };

  // Too many digits is over the limit before it is ever turned into a (possibly rounding) number.
  const wholeDigits = match[1].replaceAll(",", "").replace(/^0+(?=\d)/, "");
  const tooBig = `The amount can be at most ${formatPence(MAX_PENCE)}.`;
  if (wholeDigits.length > 7) return { ok: false, message: tooBig };

  const pence = Number(wholeDigits) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  const message = checkAmountPence(pence);
  return message ? { ok: false, message } : { ok: true, pence };
}
