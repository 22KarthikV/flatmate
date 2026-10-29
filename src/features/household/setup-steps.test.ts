import { describe, expect, it } from "vitest";

import { buildChecklist, SETUP_STEPS, type SetupStep } from "./setup-steps";

const extra: SetupStep = {
  id: "set-rent",
  title: "Set the rent",
  description: "Who collects it, and when.",
  href: "/money",
  done: () => false,
};

describe("buildChecklist", () => {
  it("starts with inviting flatmates for an owner who is alone", () => {
    const list = buildChecklist("owner", { memberCount: 1 });
    expect(list).toEqual({
      audience: "admin",
      items: [expect.objectContaining({ id: "invite-flatmates", done: false, current: true })],
    });
  });

  it("disappears once every step is done", () => {
    expect(buildChecklist("owner", { memberCount: 2 })).toBeNull();
    expect(buildChecklist("member", { memberCount: 2 })).toBeNull();
  });

  it("shows a plain member only a note while steps remain", () => {
    expect(buildChecklist("member", { memberCount: 1 }, [SETUP_STEPS[0]])).toEqual({
      audience: "member",
    });
  });

  it("lets another module add a step, kept in order, with the first open one current", () => {
    const list = buildChecklist("admin", { memberCount: 3 }, [...SETUP_STEPS, extra]);
    expect(list).toEqual({
      audience: "admin",
      items: [
        expect.objectContaining({ id: "invite-flatmates", done: true, current: false }),
        expect.objectContaining({ id: "set-rent", done: false, current: true }),
      ],
    });
  });

  it("counts a flat as set up only when the added step is done too", () => {
    const done = { ...extra, done: () => true };
    expect(buildChecklist("owner", { memberCount: 3 }, [...SETUP_STEPS, done])).toBeNull();
  });

  it("hands each step the same facts about the flat", () => {
    const seen: number[] = [];
    buildChecklist("owner", { memberCount: 4 }, [
      { ...extra, done: ({ memberCount }) => (seen.push(memberCount), true) },
    ]);
    expect(seen).toEqual([4]);
  });
});
