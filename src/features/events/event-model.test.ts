import { describe, expect, it } from "vitest";

import { buildEventView, groupEvents, type EventRow } from "./event-model";

const people = [
  { profileId: "a", displayName: "Alice" },
  { profileId: "b", displayName: "Bea" },
  { profileId: "c", displayName: "Cy" },
];

const row: EventRow = {
  id: "e1",
  title: "Pizza night",
  description: "",
  location: null,
  status: "voting",
  organiser_id: "a",
  vote_deadline: "2026-11-04T18:00:00Z",
  tiebreak_since: null,
  confirmed_option_id: null,
  starts_at: null,
  ends_at: null,
  cancelled_by: null,
  cancelled_reason: null,
  options: [
    { id: "o2", starts_at: "2026-11-07T19:00:00Z", ends_at: null, removed_at: null },
    { id: "o1", starts_at: "2026-11-06T19:00:00Z", ends_at: null, removed_at: null },
    {
      id: "o0",
      starts_at: "2026-11-05T19:00:00Z",
      ends_at: null,
      removed_at: "2026-11-01T00:00:00Z",
    },
  ],
  votes: [
    { option_id: "o1", profile_id: "b", answer: "yes" },
    { option_id: "o1", profile_id: "c", answer: "maybe" },
    { option_id: "o1", profile_id: "gone", answer: "yes" },
    { option_id: "o2", profile_id: "b", answer: "no" },
  ],
};

describe("buildEventView", () => {
  const view = buildEventView(row, people, "a");

  it("lists live dates in time order and drops removed ones", () => {
    expect(view.options.map((option) => option.id)).toEqual(["o1", "o2"]);
  });

  it("counts only current members and says what a date needs", () => {
    expect(view.options[0]!.tally).toEqual({ optionId: "o1", yes: 1, maybe: 1, no: 0 });
    expect(view.options[0]!.needs).toBe("One more yes confirms this date.");
    expect(view.options[0]!.leading).toBe(true);
    expect(view.options[1]!.leading).toBe(false);
  });

  it("shows who answered what, by name, never someone who left", () => {
    expect(view.options[0]!.voters.map((voter) => `${voter.name}:${voter.answer}`)).toEqual([
      "Bea:yes",
      "Cy:maybe",
    ]);
  });

  it("knows who has not answered and whether the viewer still needs to vote", () => {
    expect(view.waitingOn).toEqual(["Alice"]);
    expect(view.needsMyVote).toBe(true);
    expect(buildEventView(row, people, "b").needsMyVote).toBe(false);
    expect(buildEventView(row, people, "b").mine).toEqual({ o1: "yes", o2: "no" });
  });

  it("falls back for an organiser who is no longer here", () => {
    expect(buildEventView({ ...row, organiser_id: "gone" }, people, "a").organiserName).toBe(
      "A former flatmate",
    );
  });
});

describe("groupEvents", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const make = (patch: Partial<EventRow>, viewer = "a") =>
    buildEventView({ ...row, ...patch }, people, viewer);

  it("puts what needs my vote first and sorts the rest", () => {
    const groups = groupEvents(
      [
        make({ id: "voted" }, "b"),
        make({ id: "mine" }),
        make({ id: "tie", status: "tiebreak", tiebreak_since: "2026-11-03T00:00:00Z" }),
        make({
          id: "soon",
          status: "confirmed",
          starts_at: "2026-11-06T19:00:00Z",
          confirmed_option_id: "o1",
        }),
        make({
          id: "later",
          status: "confirmed",
          starts_at: "2026-11-09T19:00:00Z",
          confirmed_option_id: "o1",
        }),
        make({
          id: "gone",
          status: "confirmed",
          starts_at: "2026-10-01T19:00:00Z",
          confirmed_option_id: "o1",
        }),
        make({ id: "off", status: "cancelled" }),
      ],
      now,
    );
    expect(groups.needsVote.map((e) => e.id)).toEqual(["mine"]);
    expect(groups.stillVoting.map((e) => e.id)).toEqual(["voted"]);
    expect(groups.waitingOnOrganiser.map((e) => e.id)).toEqual(["tie"]);
    expect(groups.comingUp.map((e) => e.id)).toEqual(["soon", "later"]);
    expect(groups.past.map((e) => e.id).sort()).toEqual(["gone", "off"]);
  });
});
