// Kept free of server-only imports so it can be tested and used anywhere.

import { addMonths, dueDateFor, isActiveMonth, periodOf, type IsoDate } from "./dates";
import { roomShares } from "./rooms";
import type { FormValues } from "./template-input";

/** What the form needs to know about a saved template; the server's TemplateDetail fits this. */
export interface SavedTemplate {
  kind: "rent" | "bill";
  name: string;
  paidById: string;
  dueDay: number;
  amountMode: "fixed" | "variable";
  amountPence: number | null;
  splitMode: "equal" | "percent" | "amounts";
  activeMonths: number[];
  shares: { profileId: string; shareValue: number | null; roomId: string | null }[];
  rooms: { id: string; name: string; rentPence: number }[];
}

/** 3000 pence as "30.00", 3333 hundredths of a percent as "33.33", 5000 as "50". */
const pounds = (pence: number) => (pence / 100).toFixed(2);
const percent = (basisPoints: number) => (basisPoints / 100).toFixed(2).replace(/\.?0+$/, "");

/** The edit form's starting values, from what is saved. */
export function valuesFromTemplate(saved: SavedTemplate): FormValues {
  const base: FormValues = {
    kind: saved.kind,
    name: saved.name,
    dueDay: saved.dueDay,
    months: [...saved.activeMonths],
    paidBy: saved.paidById,
    amountMode: saved.amountMode,
    amount: saved.amountPence !== null ? pounds(saved.amountPence) : "",
    splitMode: "equal",
    everyone: true,
    chosen: [],
    percent: {},
    collectorId: saved.paidById,
    rooms: [],
    custom: {},
  };

  if (saved.kind === "bill") {
    if (saved.splitMode === "percent") {
      return {
        ...base,
        splitMode: "percent",
        percent: Object.fromEntries(
          saved.shares.map((share) => [share.profileId, percent(share.shareValue ?? 0)]),
        ),
      };
    }
    return {
      ...base,
      everyone: saved.shares.length === 0,
      chosen: saved.shares.map((share) => share.profileId),
    };
  }

  const rooms = saved.rooms.map((room, index) => ({
    key: room.id || `room-${index}`,
    name: room.name,
    rent: pounds(room.rentPence),
    occupants: saved.shares.filter((share) => share.roomId === room.id).map((s) => s.profileId),
  }));
  // A person whose saved amount is not their room's share was given a custom amount.
  const computed = roomShares(
    saved.rooms.map((room, index) => ({
      name: room.name,
      rentPence: room.rentPence,
      occupantIds: rooms[index].occupants,
    })),
    rooms.flatMap((room) => room.occupants),
  );
  const custom: Record<string, string> = {};
  if (computed.ok) {
    for (const share of computed.shares) {
      const stored = saved.shares.find((s) => s.profileId === share.profileId)?.shareValue;
      if (stored != null && stored !== share.pence) custom[share.profileId] = pounds(stored);
    }
  }
  return { ...base, rooms, custom };
}

/**
 * The next months an admin could skip: not yet created, active, and not yet past due. At most
 * `count`, oldest first.
 */
export function skippableMonths(input: {
  today: IsoDate;
  dueDay: number;
  activeMonths: readonly number[];
  existing: readonly IsoDate[];
  count?: number;
}): IsoDate[] {
  const start = periodOf(input.today);
  const result: IsoDate[] = [];
  for (let offset = 0; offset < 4 && result.length < (input.count ?? 2); offset += 1) {
    const period = addMonths(start, offset);
    if (!isActiveMonth(period, input.activeMonths)) continue;
    if (input.existing.includes(period)) continue;
    if (dueDateFor(period, input.dueDay) < input.today) continue;
    result.push(period);
  }
  return result;
}
