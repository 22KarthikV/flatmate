import { splitExpense, type Share } from "../ledger/splits";

/**
 * Splitting a month's bill. This uses the ledger's own rule (leftover pence go one at a time to
 * whoever lost most to rounding, ties to the lowest profile id) by calling `splitExpense`, and
 * adds one thing: every person is returned, with 0 for anyone whose share rounds away, so the
 * answer lines up with the SQL function the monthly job uses. The ledger writer drops the zeros.
 */

export type BillSplit =
  | { mode: "equal"; amountPence: number; profileIds: string[] }
  | { mode: "percent"; amountPence: number; shares: { profileId: string; basisPoints: number }[] };

export type BillSplitResult = { ok: true; shares: Share[] } | { ok: false; message: string };

const byProfileId = (a: Share, b: Share) =>
  a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0;

/** Everyone in the split, sorted by profile id, with 0 pence for those who round away. */
export function splitBill(input: BillSplit): BillSplitResult {
  const everyone =
    input.mode === "equal" ? input.profileIds : input.shares.map((share) => share.profileId);
  const result = splitExpense(input);
  if (!result.ok) return result;

  const given = new Map(result.shares.map((share) => [share.profileId, share.pence]));
  return {
    ok: true,
    shares: everyone
      .map((profileId) => ({ profileId, pence: given.get(profileId) ?? 0 }))
      .sort(byProfileId),
  };
}

/** An equal bill over exactly the people in the flat (or the ones chosen) when the month is created. */
export function equalShares(profileIds: string[], totalPence: number): BillSplitResult {
  return splitBill({ mode: "equal", amountPence: totalPence, profileIds });
}
