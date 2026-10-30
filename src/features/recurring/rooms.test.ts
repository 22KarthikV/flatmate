import { describe, expect, it } from "vitest";

import { randomSource } from "../ledger/random-for-tests";
import { rentAmounts, roomShares, type RentRoom } from "./rooms";

const id = (n: number) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
const [P1, P2, P3, P4, P5] = [id(1), id(2), id(3), id(4), id(5)];

// The first flat: five people, three bedrooms. Two rooms shared by two, one private.
const firstFlat: RentRoom[] = [
  { name: "Big room", rentPence: 120_000, occupantIds: [P1, P2] },
  { name: "Back room", rentPence: 90_001, occupantIds: [P3, P4] },
  { name: "Box room", rentPence: 55_000, occupantIds: [P5] },
];
const everyone = [P1, P2, P3, P4, P5];

function ok(result: ReturnType<typeof roomShares>) {
  if (!result.ok) throw new Error(`expected shares, got: ${result.message}`);
  return result;
}

describe("roomShares", () => {
  it("splits the first flat's three bedrooms to the penny", () => {
    const result = ok(roomShares(firstFlat, everyone));
    expect(result.shares.map(({ profileId, pence }) => [profileId, pence])).toEqual([
      [P1, 60_000],
      [P2, 60_000],
      [P3, 45_001], // the odd penny goes to the lowest profile id
      [P4, 45_000],
      [P5, 55_000],
    ]);
    expect(result.totalPence).toBe(265_001);
    expect(result.shares.map((s) => s.roomIndex)).toEqual([0, 0, 1, 1, 2]);
  });

  it("gives a shared £601 room 301 and 300", () => {
    const result = ok(
      roomShares([{ name: "R", rentPence: 60_100, occupantIds: [P2, P1] }], [P1, P2]),
    );
    expect(result.shares.map((s) => s.pence)).toEqual([30_050, 30_050]);
    const odd = ok(roomShares([{ name: "R", rentPence: 60_101, occupantIds: [P2, P1] }], [P1, P2]));
    expect(odd.shares).toEqual([
      { profileId: P1, pence: 30_051, roomIndex: 0 },
      { profileId: P2, pence: 30_050, roomIndex: 0 },
    ]);
  });

  it("does not depend on the order of rooms, occupants or people", () => {
    const flipped: RentRoom[] = [...firstFlat].reverse().map((room) => ({
      ...room,
      occupantIds: [...room.occupantIds].reverse(),
    }));
    const a = ok(roomShares(firstFlat, everyone));
    const b = ok(roomShares(flipped, [...everyone].reverse()));
    expect(b.shares.map(({ profileId, pence }) => ({ profileId, pence }))).toEqual(
      a.shares.map(({ profileId, pence }) => ({ profileId, pence })),
    );
    expect(b.totalPence).toBe(a.totalPence);
  });

  it("refuses a person who is in no room", () => {
    const result = roomShares(firstFlat.slice(0, 2), everyone);
    expect(result).toEqual({
      ok: false,
      message: "Everyone needs a room. Place each person in one.",
    });
  });

  it("refuses a person in two rooms", () => {
    const result = roomShares(
      [
        { name: "A", rentPence: 50_000, occupantIds: [P1, P2] },
        { name: "B", rentPence: 50_000, occupantIds: [P2, P3] },
      ],
      [P1, P2, P3],
    );
    expect(result).toEqual({ ok: false, message: "Each person can only live in one room." });
  });

  it("refuses a room with nobody, no rooms, and someone who is not in the flat", () => {
    expect(roomShares([{ name: "Empty", rentPence: 50_000, occupantIds: [] }], []).ok).toBe(false);
    expect(roomShares([], [P1]).ok).toBe(false);
    expect(roomShares([{ name: "A", rentPence: 50_000, occupantIds: [P1, P2] }], [P1]).ok).toBe(
      false,
    );
  });

  it("limits a room's rent to 1p to £10,000", () => {
    expect(roomShares([{ name: "A", rentPence: 0, occupantIds: [P1] }], [P1]).ok).toBe(false);
    expect(roomShares([{ name: "A", rentPence: 1_000_001, occupantIds: [P1] }], [P1]).ok).toBe(
      false,
    );
    expect(roomShares([{ name: "A", rentPence: 1_000_000, occupantIds: [P1] }], [P1]).ok).toBe(
      true,
    );
    expect(roomShares([{ name: "A", rentPence: 1, occupantIds: [P1] }], [P1]).ok).toBe(true);
  });

  it("refuses a room too small to give each person at least 1p", () => {
    const result = roomShares([{ name: "Tiny", rentPence: 1, occupantIds: [P1, P2] }], [P1, P2]);
    expect(result.ok).toBe(false);
  });

  it("always sums to the total of all rooms (property)", () => {
    const random = randomSource(1101);
    for (let run = 0; run < 300; run += 1) {
      const roomCount = 1 + Math.floor(random() * 4);
      let next = 1;
      const rooms: RentRoom[] = [];
      const people: string[] = [];
      for (let r = 0; r < roomCount; r += 1) {
        const size = 1 + Math.floor(random() * 3);
        const occupantIds = Array.from({ length: size }, () => id(next++));
        people.push(...occupantIds);
        rooms.push({
          name: `Room ${r}`,
          rentPence: size + Math.floor(random() * 300_000),
          occupantIds,
        });
      }
      const result = ok(roomShares(rooms, people));
      expect(result.shares.reduce((sum, s) => sum + s.pence, 0)).toBe(result.totalPence);
      expect(result.shares).toHaveLength(people.length);
    }
  });
});

describe("rentAmounts", () => {
  it("uses the room share unless an admin typed a custom amount", () => {
    const result = rentAmounts(firstFlat, everyone, { [P5]: 50_000 });
    if (!result.ok) throw new Error(result.message);
    expect(result.amounts.find((a) => a.profileId === P5)?.pence).toBe(50_000);
    expect(result.amounts.find((a) => a.profileId === P1)?.pence).toBe(60_000);
    expect(result.totalPence).toBe(260_001);
  });

  it("refuses a custom amount outside 1p to £10,000", () => {
    expect(rentAmounts(firstFlat, everyone, { [P1]: 0 }).ok).toBe(false);
    expect(rentAmounts(firstFlat, everyone, { [P1]: 1_000_001 }).ok).toBe(false);
    expect(rentAmounts(firstFlat, everyone, { [P1]: 10.5 }).ok).toBe(false);
  });
});
