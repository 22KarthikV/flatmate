// Pure: what only admins can fix, as short links.

export interface AdminExtrasInput {
  /** Rent payments waiting for confirmation. */
  pendingRentPayments: number;
  /** Chores nobody could take this week. */
  unassignedChores: string[];
  /** The invite link is still open, so someone may not have joined yet. */
  inviteOpen: boolean;
}

export interface AdminItem {
  key: string;
  text: string;
  href: string;
}

export function buildAdminExtras(input: AdminExtrasInput): AdminItem[] {
  const items: AdminItem[] = [];
  if (input.pendingRentPayments > 0) {
    const n = input.pendingRentPayments;
    items.push({
      key: "rent",
      text: `${n} rent ${n === 1 ? "payment" : "payments"} waiting to confirm`,
      href: "/money/rent",
    });
  }
  for (const name of input.unassignedChores) {
    items.push({
      key: `unassigned-${name}`,
      text: `Nobody could do ${name} this week`,
      href: "/rota",
    });
  }
  if (input.inviteOpen) {
    items.push({
      key: "invite",
      text: "Your invite link is still open. Not everyone may have joined",
      href: "/more/flat",
    });
  }
  return items;
}
