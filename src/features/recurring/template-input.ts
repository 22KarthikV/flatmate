// Kept free of server-only imports: the template form uses this to check what is typed and show
// each person's amount as you type, and the server action uses the same code to decide what is
// saved. The database checks everything again, so this is for clear messages, not for trust.

import { parsePercent } from "@/features/ledger/form";
import { formatPence, parsePounds } from "@/features/ledger/money";

import { ALL_MONTHS } from "./dates";
import { rentAmounts, type RentRoom } from "./rooms";
import { parseTemplate, type TemplateInput, type TemplateValue } from "./schemas";

export interface RoomValues {
  /** Stable key for the form; not saved. */
  key: string;
  name: string;
  /** Pounds, as typed. */
  rent: string;
  occupants: string[];
}

/** Everything the template form holds, as plain text, before any of it is checked. */
export interface FormValues {
  kind: "rent" | "bill";
  name: string;
  dueDay: number;
  months: number[];
  // Bill
  paidBy: string;
  amountMode: "fixed" | "variable";
  amount: string;
  splitMode: "equal" | "percent";
  /** Equal bill: shared by everyone in the flat, including people who join later. */
  everyone: boolean;
  /** Equal bill, when not everyone: who is ticked. */
  chosen: string[];
  /** Percentage bill: a percentage typed against each person's id. */
  percent: Record<string, string>;
  // Rent
  collectorId: string;
  rooms: RoomValues[];
  /** Pounds typed against a person's id when they pay something other than their room's share. */
  custom: Record<string, string>;
}

export function emptyValues(kind: "rent" | "bill", defaults: { profileId: string }): FormValues {
  return {
    kind,
    name: kind === "rent" ? "Rent" : "",
    dueDay: 1,
    months: [...ALL_MONTHS],
    paidBy: defaults.profileId,
    amountMode: "fixed",
    amount: "",
    splitMode: "equal",
    everyone: true,
    chosen: [],
    percent: {},
    collectorId: defaults.profileId,
    rooms: [{ key: "room-1", name: "", rent: "", occupants: [] }],
    custom: {},
  };
}

export interface Summary {
  /** What everyone together pays (rent), or the fixed amount (bill); null when it changes. */
  totalPence: number | null;
  /** Rent: each person's pence. Empty for a bill. */
  amounts: { profileId: string; pence: number }[];
}

export type BuiltTemplate =
  | { ok: true; input: TemplateInput; value: TemplateValue; summary: Summary }
  | { ok: false; message: string };

const fail = (message: string): BuiltTemplate => ({ ok: false, message });

/** The form's text turned into a checked template and what it comes to, or the first problem. */
export function buildTemplate(values: FormValues): BuiltTemplate {
  const common = { name: values.name, dueDay: values.dueDay, activeMonths: values.months };

  if (values.kind === "bill") {
    let amountPence: number | null = null;
    if (values.amountMode === "fixed") {
      const amount = parsePounds(values.amount);
      if (!amount.ok) return fail(amount.message);
      amountPence = amount.pence;
    }
    const people: { profileId: string; basisPoints?: number }[] = [];
    if (values.splitMode === "percent") {
      for (const [profileId, text] of Object.entries(values.percent)) {
        if (text.trim() === "") continue;
        const parsed = parsePercent(text);
        if (!parsed.ok) return fail(parsed.message);
        people.push({ profileId, basisPoints: parsed.basisPoints });
      }
    } else if (!values.everyone) {
      if (values.chosen.length === 0) return fail("Choose who shares this bill.");
      for (const profileId of values.chosen) people.push({ profileId });
    }
    const input: TemplateInput = {
      kind: "bill",
      ...common,
      paidBy: values.paidBy,
      amountMode: values.amountMode,
      amountPence,
      splitMode: values.splitMode,
      people,
    };
    const parsed = parseTemplate(input);
    return parsed.ok
      ? { ok: true, input, value: parsed.value, summary: { totalPence: amountPence, amounts: [] } }
      : fail(parsed.error);
  }

  const rooms: { name: string; rentPence: number; occupantIds: string[] }[] = [];
  for (const [index, room] of values.rooms.entries()) {
    const rent = parsePounds(room.rent);
    if (!rent.ok) return fail(`${room.name.trim() || `Room ${index + 1}`}: ${rent.message}`);
    rooms.push({ name: room.name, rentPence: rent.pence, occupantIds: room.occupants });
  }
  const custom: { profileId: string; pence: number }[] = [];
  for (const [profileId, text] of Object.entries(values.custom)) {
    if (text.trim() === "") continue;
    const parsed = parsePounds(text);
    if (!parsed.ok) return fail(parsed.message);
    custom.push({ profileId, pence: parsed.pence });
  }

  const input: TemplateInput = {
    kind: "rent",
    ...common,
    collectorId: values.collectorId,
    rooms,
    custom,
  };
  const parsed = parseTemplate(input);
  if (!parsed.ok) return fail(parsed.error);
  if (parsed.value.kind !== "rent") return fail("Check the details and try again.");

  const everyone = parsed.value.rooms.flatMap((room) => room.occupantIds);
  const amounts = rentAmounts(
    parsed.value.rooms,
    everyone,
    Object.fromEntries(parsed.value.custom.map((c) => [c.profileId, c.pence])),
  );
  if (!amounts.ok) return fail(amounts.message);
  return {
    ok: true,
    input,
    value: parsed.value,
    summary: { totalPence: amounts.totalPence, amounts: amounts.amounts },
  };
}

/** The JSON the database function takes, from a checked template. Rent amounts are fixed here. */
export function toRpcPayload(value: TemplateValue): Record<string, unknown> {
  if (value.kind === "bill") {
    return {
      kind: "bill",
      name: value.name,
      paid_by: value.paidBy,
      due_day: value.dueDay,
      amount_mode: value.amountMode,
      amount_pence: value.amountPence,
      split_mode: value.splitMode,
      people: value.people.map((person) => ({
        profile_id: person.profileId,
        basis_points: person.basisPoints ?? null,
      })),
      active_months: value.activeMonths,
    };
  }

  const rooms: RentRoom[] = value.rooms;
  const custom = Object.fromEntries(value.custom.map((c) => [c.profileId, c.pence]));
  const amounts = rentAmounts(
    rooms,
    rooms.flatMap((room) => room.occupantIds),
    custom,
  );
  if (!amounts.ok) throw new Error(amounts.message);
  const pence = new Map(amounts.amounts.map((a) => [a.profileId, a.pence]));
  return {
    kind: "rent",
    name: value.name,
    collector_id: value.collectorId,
    due_day: value.dueDay,
    active_months: value.activeMonths,
    rooms: rooms.map((room) => ({
      name: room.name,
      rent_pence: room.rentPence,
      people: room.occupantIds.map((profileId) => ({
        profile_id: profileId,
        pence: pence.get(profileId) ?? 0,
      })),
    })),
  };
}

/** "£2,650.01 a month across 5 people". */
export function describeTotal(summary: Summary): string | null {
  if (summary.totalPence === null) return null;
  return summary.amounts.length > 0
    ? `${formatPence(summary.totalPence)} a month across ${summary.amounts.length} ${summary.amounts.length === 1 ? "person" : "people"}`
    : `${formatPence(summary.totalPence)} a month`;
}
