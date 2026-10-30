/** One person's net position: positive is owed to them, negative is what they owe. */
export interface Balance {
  profileId: string;
  pence: number;
}

/** "from pays to": a suggested payment. */
export interface Payment {
  from: string;
  to: string;
  pence: number;
}

const byAmountThenId = (a: Balance, b: Balance) =>
  b.pence - a.pence || (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0);

/**
 * The fewest payments that would square everyone up. The largest debtor pays the largest
 * creditor as much as they can, and that repeats; every step settles at least one person, so a
 * flat of n people never needs more than n - 1 payments. Ties go to the lowest profile id, so the
 * same balances always give the same list, in whatever order they arrive.
 *
 * The balances must add up to zero, which the database guarantees. If they do not, this throws
 * rather than inventing or hiding money.
 */
export function simplifyDebts(balances: Balance[]): Payment[] {
  if (balances.some((b) => !Number.isInteger(b.pence))) {
    throw new RangeError("Each balance must be a whole number of pence.");
  }
  if (new Set(balances.map((b) => b.profileId)).size !== balances.length) {
    throw new RangeError("Each person can appear only once in the balances.");
  }
  if (balances.reduce((sum, b) => sum + b.pence, 0) !== 0) {
    throw new RangeError("Balances must add up to zero.");
  }

  const creditors = balances.filter((b) => b.pence > 0).map((b) => ({ ...b }));
  // Debtors are kept as positive amounts owed, so both lists sort the same way.
  const debtors = balances.filter((b) => b.pence < 0).map((b) => ({ ...b, pence: -b.pence }));
  const payments: Payment[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountThenId);
    debtors.sort(byAmountThenId);
    const creditor = creditors[0];
    const debtor = debtors[0];
    const pence = Math.min(creditor.pence, debtor.pence);

    payments.push({ from: debtor.profileId, to: creditor.profileId, pence });
    creditor.pence -= pence;
    debtor.pence -= pence;
    if (creditor.pence === 0) creditors.shift();
    if (debtor.pence === 0) debtors.shift();
  }

  return payments;
}
