import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_TYPES, getNotificationType, isNotificationType } from "./types";

describe("notification types", () => {
  it("looks a type up by id", () => {
    expect(getNotificationType("role_changed")?.defaultPush).toBe(true);
    expect(getNotificationType("member_joined")?.defaultPush).toBe(false);
    expect(getNotificationType("member_left")?.defaultPush).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(getNotificationType("nonsense")).toBeUndefined();
    expect(isNotificationType("nonsense")).toBe(false);
    expect(isNotificationType(undefined)).toBe(false);
    expect(isNotificationType("member_left")).toBe(true);
  });

  it("has unique ids and a label for each", () => {
    const ids = NOTIFICATION_TYPES.map((entry) => entry.type);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of NOTIFICATION_TYPES) expect(entry.label.length).toBeGreaterThan(0);
  });

  it("matches the defaults the database was given", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");

    for (const entry of NOTIFICATION_TYPES) {
      const row = new RegExp(
        String.raw`\(\s*'${entry.type}'\s*,\s*${entry.defaultInApp}\s*,\s*${entry.defaultPush}\s*(,\s*${entry.snoozable}\s*)?\)`,
      );
      expect(sql, `migration row for ${entry.type}`).toMatch(row);
    }
  });
});
