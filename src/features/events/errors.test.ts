import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EVENT_ERROR_CODES, eventErrorMessage, isExpectedEventError } from "./errors";

describe("event errors", () => {
  it("maps every code the database functions raise to a sentence", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261142000000_events_write.sql"),
      "utf8",
    );
    const raised = new Set([...sql.matchAll(/raise exception '(\w+)'/g)].map((match) => match[1]!));
    expect(raised.size).toBeGreaterThan(10);
    for (const code of raised) {
      expect(EVENT_ERROR_CODES, `message for ${code}`).toContain(code);
      expect(eventErrorMessage({ message: code }).length).toBeGreaterThan(10);
    }
  });

  it("falls back to a general sentence for anything else", () => {
    expect(eventErrorMessage({ message: "boom" })).toMatch(/try again/);
    expect(eventErrorMessage(null)).toMatch(/try again/);
    expect(isExpectedEventError({ message: "boom" })).toBe(false);
    expect(isExpectedEventError({ message: "not_allowed" })).toBe(true);
  });
});
