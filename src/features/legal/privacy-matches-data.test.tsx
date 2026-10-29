import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "@/app/(public)/privacy/page";

/**
 * The privacy notice must describe what the database really holds. If a column is added to a
 * table of personal data, this test fails until someone has read the notice and updated it.
 */
function columnsOf(table: string): string[] {
  const types = readFileSync(path.join(process.cwd(), "src/lib/db/types.ts"), "utf8");
  const block = types.match(new RegExp(`\\b${table}: \\{\\s*Row: \\{([\\s\\S]*?)\\n\\s*\\};`))?.[1];
  if (!block) throw new Error(`No ${table} table in the generated types`);
  return [...block.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]).sort();
}

describe("privacy notice", () => {
  it("covers every column of the profiles table as it stands today", () => {
    expect(columnsOf("profiles")).toEqual([
      "avatar_url",
      "created_at",
      "deleted_at",
      "display_name",
      "id",
      "updated_at",
      "user_id",
    ]);
  });

  it("covers every column of the household tables as they stand today", () => {
    expect(columnsOf("households")).toEqual([
      "closed_at",
      "created_at",
      "created_by",
      "id",
      "name",
      "timezone",
      "updated_at",
    ]);
    expect(columnsOf("memberships")).toEqual([
      "household_id",
      "id",
      "joined_at",
      "left_at",
      "left_reason",
      "profile_id",
      "role",
    ]);
    expect(columnsOf("invites")).toEqual([
      "created_at",
      "created_by",
      "expires_at",
      "household_id",
      "id",
      "revoked_at",
      "token_hash",
    ]);
  });

  it("explains the flat data, who sees it and what happens when someone leaves", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";

    for (const phrase of [
      "What we store about your flat",
      "membership",
      "owner, admin or member",
      "when and why you left",
      "invite link",
      "scrambled fingerprint",
      "can see your display name, photo and role",
      "If you owned a flat with no one else in it",
      "hand it over first",
    ]) {
      expect(text, `the notice should mention "${phrase}"`).toContain(phrase);
    }
  });

  it("names what is stored, who processes it, and how to leave", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";

    for (const phrase of [
      "email address",
      "display name",
      "photo",
      "Google",
      "Supabase",
      "London",
      "Vercel",
      "Sign-in cookies",
      "no advertising, analytics or tracking cookies",
      "Delete account",
      "Deleted user",
      "Information Commissioner",
    ]) {
      expect(text, `the notice should mention "${phrase}"`).toContain(phrase);
    }
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What we keep, and why");
  });
});
