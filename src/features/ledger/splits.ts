import { checkAmountPence, formatPence } from "./money";

/** Hundredths of a percent: 10000 is 100%, 3333 is 33.33%. Whole numbers only, so nothing is a float. */
export const WHOLE = 10_000;

export type SplitInput =
  | { mode: "equal"; amountPence: number; profileIds: string[] }
  | { mode: "exact"; amountPence: number; shares: { profileId: string; pence: number }[] }
  | { mode: "percent"; amountPence: number; shares: { profileId: string; basisPoints: number }[] }
  | { mode: "one"; amountPence: number; profileId: string };

export interface Share {
  profileId: string;
  pence: number;
}

export type SplitResult = { ok: true; shares: Share[] } | { ok: false; message: string };

const fail = (message: string): SplitResult => ({ ok: false, message });

// Plain comparison, not localeCompare, so the order is the same on every device and server.
const byProfileId = (a: { profileId: string }, b: { profileId: string }) =>
  a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0;

/** 99.99, 110, 33.3: a percentage from hundredths, without trailing zeros. */
function formatPercent(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Hands out `amountPence` in proportion to whole-number weights. Each person gets the rounded-down
 * share; the pence left over go one at a time to whoever lost the most to rounding, and to the
 * lowest profile id on a tie. The answer is the same every time and always sums to the amount.
 * People who end up with nothing are left out.
 */
function allocate(amountPence: number, entries: { profileId: string; weight: number }[]): Share[] {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const parts = entries.map((entry) => {
    const product = amountPence * entry.weight; // at most 1,000,000 * 10,000: safe in a double
    return {
      profileId: entry.profileId,
      pence: Math.floor(product / totalWeight),
      remainder: product % totalWeight,
    };
  });

  let leftover = amountPence - parts.reduce((sum, part) => sum + part.pence, 0);
  const luckiest = [...parts].sort((a, b) => b.remainder - a.remainder || byProfileId(a, b));
  for (const part of luckiest) {
    if (leftover === 0) break;
    part.pence += 1;
    leftover -= 1;
  }

  return parts
    .filter((part) => part.pence > 0)
    .sort(byProfileId)
    .map(({ profileId, pence }) => ({ profileId, pence }));
}

function hasDuplicates(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * Turns "this expense, shared this way" into one share of pence per person, or says what is wrong.
 * The database checks the same rules again (shares sum to the amount, everyone is in the flat), so
 * a mistake here cannot reach the ledger.
 */
export function splitExpense(input: SplitInput): SplitResult {
  const amountMessage = checkAmountPence(input.amountPence);
  if (amountMessage) return fail(amountMessage);
  const { amountPence } = input;

  switch (input.mode) {
    case "one": {
      if (!input.profileId) return fail("Choose who this is for.");
      return { ok: true, shares: [{ profileId: input.profileId, pence: amountPence }] };
    }

    case "equal": {
      if (input.profileIds.length === 0 || input.profileIds.some((id) => !id)) {
        return fail("Choose at least one person.");
      }
      if (hasDuplicates(input.profileIds)) return fail("Each person can only appear once.");
      return {
        ok: true,
        shares: allocate(
          amountPence,
          input.profileIds.map((profileId) => ({ profileId, weight: 1 })),
        ),
      };
    }

    case "exact": {
      if (input.shares.length === 0 || input.shares.some((s) => !s.profileId)) {
        return fail("Choose at least one person.");
      }
      if (hasDuplicates(input.shares.map((s) => s.profileId))) {
        return fail("Each person can only appear once.");
      }
      if (input.shares.some((s) => !Number.isInteger(s.pence) || s.pence < 0)) {
        return fail("Each amount must be a whole number of pence, zero or more.");
      }
      const sum = input.shares.reduce((total, s) => total + s.pence, 0);
      if (sum !== amountPence) {
        const gap = amountPence - sum;
        return fail(
          `The amounts add up to ${formatPence(sum)}, but the expense is ${formatPence(amountPence)}. ` +
            (gap > 0
              ? `${formatPence(gap)} is left to share out.`
              : `They are ${formatPence(-gap)} too much.`),
        );
      }
      return {
        ok: true,
        shares: input.shares
          .filter((s) => s.pence > 0)
          .map(({ profileId, pence }) => ({ profileId, pence }))
          .sort(byProfileId),
      };
    }

    case "percent": {
      if (input.shares.length === 0 || input.shares.some((s) => !s.profileId)) {
        return fail("Choose at least one person.");
      }
      if (hasDuplicates(input.shares.map((s) => s.profileId))) {
        return fail("Each person can only appear once.");
      }
      if (
        input.shares.some(
          (s) => !Number.isInteger(s.basisPoints) || s.basisPoints < 0 || s.basisPoints > WHOLE,
        )
      ) {
        return fail("Each percentage must be between 0% and 100%.");
      }
      const sum = input.shares.reduce((total, s) => total + s.basisPoints, 0);
      if (sum !== WHOLE) {
        return fail(`The percentages must add up to 100%. They add up to ${formatPercent(sum)}%.`);
      }
      return {
        ok: true,
        shares: allocate(
          amountPence,
          input.shares.map((s) => ({ profileId: s.profileId, weight: s.basisPoints })),
        ),
      };
    }
  }
}
