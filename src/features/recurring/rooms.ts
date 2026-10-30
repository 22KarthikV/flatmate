import { formatPence, MAX_PENCE } from "../ledger/money";
import { splitExpense, type Share } from "../ledger/splits";

/**
 * Rent is set up by room (SPEC-recurring R4). A room has a monthly rent and the people who live
 * in it; each person pays their room's rent divided equally among its occupants, with leftover
 * pence handed out by the ledger's rule (largest remainder, ties to the lowest profile id). The
 * amounts are worked out here when the template is saved and stored as pence, so the monthly job
 * never has to split anything.
 */

export interface RentRoom {
  name: string;
  rentPence: number;
  /** Profile ids of the people who live here. */
  occupantIds: string[];
}

export interface RentShare extends Share {
  /** Index into the rooms that were passed in. */
  roomIndex: number;
}

export type RoomSharesResult =
  { ok: true; shares: RentShare[]; totalPence: number } | { ok: false; message: string };

const fail = (message: string): RoomSharesResult => ({ ok: false, message });

const byProfileId = (a: Share, b: Share) =>
  a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0;

/**
 * Each person's rent, from the rooms. `peopleIds` is everyone who must be placed: a person in no
 * room, or in two rooms, is refused. The shares come back sorted by profile id, so the answer does
 * not depend on the order the rooms or people were entered in.
 */
export function roomShares(rooms: RentRoom[], peopleIds: string[]): RoomSharesResult {
  if (rooms.length === 0) return fail("Add at least one room.");

  const placed = new Map<string, number>();
  for (const [index, room] of rooms.entries()) {
    const label = room.name.trim() || `Room ${index + 1}`;
    if (!Number.isInteger(room.rentPence) || room.rentPence < 1) {
      return fail(`${label}: enter the rent, at least 1p.`);
    }
    if (room.rentPence > MAX_PENCE) {
      return fail(`${label}: the rent can be at most ${formatPence(MAX_PENCE)}.`);
    }
    if (room.occupantIds.length === 0) return fail(`${label}: choose who lives there.`);
    for (const id of room.occupantIds) {
      if (placed.has(id)) return fail("Each person can only live in one room.");
      placed.set(id, index);
    }
  }
  if (peopleIds.some((id) => !placed.has(id))) {
    return fail("Everyone needs a room. Place each person in one.");
  }
  if (placed.size !== new Set(peopleIds).size) {
    return fail("A room has someone who is not in the flat.");
  }

  const shares: RentShare[] = [];
  for (const [index, room] of rooms.entries()) {
    const split = splitExpense({
      mode: "equal",
      amountPence: room.rentPence,
      profileIds: room.occupantIds,
    });
    if (!split.ok) return fail(split.message);
    if (split.shares.length < room.occupantIds.length) {
      const label = room.name.trim() || `Room ${index + 1}`;
      return fail(`${label}: the rent is too small to share between that many people.`);
    }
    for (const share of split.shares) shares.push({ ...share, roomIndex: index });
  }

  return {
    ok: true,
    shares: shares.sort(byProfileId),
    totalPence: rooms.reduce((sum, room) => sum + room.rentPence, 0),
  };
}

export type RentAmountsResult =
  { ok: true; amounts: Share[]; totalPence: number } | { ok: false; message: string };

/**
 * What each person will be charged: their room's share, or the custom amount an admin typed for
 * them (then the room is only a label). The total is what everyone will be charged together.
 */
export function rentAmounts(
  rooms: RentRoom[],
  peopleIds: string[],
  custom: Record<string, number> = {},
): RentAmountsResult {
  const result = roomShares(rooms, peopleIds);
  if (!result.ok) return result;

  const amounts: Share[] = [];
  for (const share of result.shares) {
    const typed = custom[share.profileId];
    if (typed === undefined) {
      amounts.push({ profileId: share.profileId, pence: share.pence });
      continue;
    }
    if (!Number.isInteger(typed) || typed < 1 || typed > MAX_PENCE) {
      return {
        ok: false,
        message: `A custom amount must be between 1p and ${formatPence(MAX_PENCE)}.`,
      };
    }
    amounts.push({ profileId: share.profileId, pence: typed });
  }
  return { ok: true, amounts, totalPence: amounts.reduce((sum, amount) => sum + amount.pence, 0) };
}
