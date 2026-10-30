// Kept free of server-only imports: the settle-up form and its server action read a payment the
// same way, and the database checks it again.

import { parsePounds } from "./money";

export interface RawSettlement {
  to: string;
  amount: string;
}

export type ParsedSettlement =
  { ok: true; value: { toProfile: string; amountPence: number } } | { ok: false; message: string };

/** The person paid must be another current flatmate; the amount a proper amount of pounds and pence. */
export function parseSettlementFields(
  raw: RawSettlement,
  memberIds: string[],
  viewerId: string,
): ParsedSettlement {
  if (!raw.to || raw.to === viewerId || !memberIds.includes(raw.to)) {
    return { ok: false, message: "Choose who you paid." };
  }
  const amount = parsePounds(raw.amount);
  if (!amount.ok) return amount;
  return { ok: true, value: { toProfile: raw.to, amountPence: amount.pence } };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function rawSettlementFromFormData(form: FormData): RawSettlement {
  return { to: text(form, "to"), amount: text(form, "amount") };
}

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * What to prefill when the page is opened from a suggested payment (`?to=…&amount=3.00`). The link
 * is only a convenience, so anything unexpected in it is dropped rather than shown or trusted.
 */
export function prefillSettlement(
  params: { to?: Param; amount?: Param },
  memberIds: string[],
  viewerId: string,
): RawSettlement {
  const to = first(params.to);
  const amount = first(params.amount);
  return {
    to: to !== viewerId && memberIds.includes(to) ? to : "",
    amount: amount !== "" && parsePounds(amount).ok ? amount : "",
  };
}
