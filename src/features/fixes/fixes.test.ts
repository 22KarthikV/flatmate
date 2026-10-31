import { describe, expect, it } from "vitest";

import { fixErrorMessage, isExpectedFixError } from "./errors";
import { canChangeStatus, canHandOver, canHide, canTakeChase } from "./permissions";
import { parseFixFields, parseFixId, parseNote } from "./schemas";
import { ageText, chasingText, groupReports, statusLabel, type FixReport } from "./view";

const ID = "f0000000-0000-0000-0000-00000000000a";

const report = (id: string, over: Partial<FixReport> = {}): FixReport => ({
  id,
  title: id,
  details: null,
  location: null,
  status: "open",
  reportedBy: "p-bob",
  reporterName: "Bob",
  chaserId: null,
  chaserName: null,
  createdAt: "2026-11-01T10:00:00Z",
  lastActivityAt: "2026-11-01T10:00:00Z",
  ...over,
});

describe("parseFixFields", () => {
  it("trims, and treats blank details and room as none", () => {
    expect(parseFixFields({ title: "  Fan broken ", details: " ", location: "" })).toEqual({
      ok: true,
      value: { title: "Fan broken", details: null, location: null },
    });
  });
  it("keeps details and room", () => {
    expect(parseFixFields({ title: "Fan", details: "Rattles", location: "Bathroom" })).toEqual({
      ok: true,
      value: { title: "Fan", details: "Rattles", location: "Bathroom" },
    });
  });
  it("refuses an empty title and over-long fields", () => {
    expect(parseFixFields({ title: " ", details: "", location: "" })).toMatchObject({ ok: false });
    expect(parseFixFields({ title: "x".repeat(81), details: "", location: "" })).toMatchObject({
      ok: false,
    });
    expect(parseFixFields({ title: "x", details: "x".repeat(501), location: "" })).toMatchObject({
      ok: false,
    });
    expect(parseFixFields({ title: "x", details: "", location: "x".repeat(41) })).toMatchObject({
      ok: false,
    });
  });
});

describe("parseNote and ids", () => {
  it("checks the note", () => {
    expect(parseNote("  Emailed the agent ")).toEqual({ ok: true, value: "Emailed the agent" });
    expect(parseNote(" ")).toMatchObject({ ok: false });
    expect(parseNote("x".repeat(301))).toMatchObject({ ok: false });
  });
  it("accepts a uuid and nothing else", () => {
    expect(parseFixId(ID)).toBe(ID);
    expect(parseFixId("nope")).toBeNull();
  });
});

describe("permissions", () => {
  const r = report("a", { chaserId: "p-carol" });
  it("the reporter, the chaser and admins change the status", () => {
    expect(canChangeStatus(r, { profileId: "p-bob", isAdmin: false })).toBe(true);
    expect(canChangeStatus(r, { profileId: "p-carol", isAdmin: false })).toBe(true);
    expect(canChangeStatus(r, { profileId: "p-dan", isAdmin: false })).toBe(false);
    expect(canChangeStatus(r, { profileId: "p-dan", isAdmin: true })).toBe(true);
  });
  it("anyone can take the chase only when nobody has it", () => {
    expect(canTakeChase(report("a"))).toBe(true);
    expect(canTakeChase(r)).toBe(false);
  });
  it("the chaser or an admin hands it over; only admins hide", () => {
    expect(canHandOver(r, { profileId: "p-carol", isAdmin: false })).toBe(true);
    expect(canHandOver(r, { profileId: "p-bob", isAdmin: false })).toBe(false);
    expect(canHandOver(r, { profileId: "p-bob", isAdmin: true })).toBe(true);
    expect(canHide({ profileId: "p-bob", isAdmin: false })).toBe(false);
    expect(canHide({ profileId: "p-bob", isAdmin: true })).toBe(true);
  });
});

describe("view helpers", () => {
  it("groups by status, newest first inside each", () => {
    const groups = groupReports([
      report("old", { createdAt: "2026-10-01T10:00:00Z" }),
      report("new", { createdAt: "2026-11-02T10:00:00Z" }),
      report("doing", { status: "in_progress" }),
      report("done", { status: "fixed" }),
    ]);
    expect(groups.open.map((x) => x.id)).toEqual(["new", "old"]);
    expect(groups.inProgress.map((x) => x.id)).toEqual(["doing"]);
    expect(groups.fixed.map((x) => x.id)).toEqual(["done"]);
  });
  it("says who is chasing, or that nobody is", () => {
    expect(chasingText(report("a"))).toBe("Nobody chasing");
    expect(chasingText(report("a", { chaserId: "p", chaserName: "Sam" }))).toBe("Chasing: Sam");
  });
  it("labels statuses in words", () => {
    expect(statusLabel("open")).toBe("Open");
    expect(statusLabel("in_progress")).toBe("In progress");
    expect(statusLabel("fixed")).toBe("Fixed");
  });
  it("reads ages naturally", () => {
    const now = "2026-11-10T12:00:00Z";
    expect(ageText("2026-11-10T11:59:40Z", now)).toBe("just now");
    expect(ageText("2026-11-10T09:00:00Z", now)).toBe("3 hours ago");
    expect(ageText("2026-11-09T12:00:00Z", now)).toBe("yesterday");
    expect(ageText("2026-11-01T12:00:00Z", now)).toBe("9 days ago");
  });
});

describe("fixErrorMessage", () => {
  it.each([
    ["too_many_open", "The flat has 50 open reports. Mark some as fixed first."],
    ["already_chasing", "Someone is already chasing this."],
    ["report_not_found", "We couldn’t find that report. It may have been removed."],
    ["not_a_member", "Choose someone who is still in the flat."],
    ["not_allowed", "You can’t do that to this report."],
  ])("explains %s", (message, text) => {
    expect(fixErrorMessage({ message })).toBe(text);
    expect(isExpectedFixError({ message })).toBe(true);
  });
  it("is general otherwise", () => {
    expect(fixErrorMessage({ message: "x" })).toBe("We couldn’t save that. Please try again.");
    expect(isExpectedFixError({ message: "x" })).toBe(false);
  });
});
