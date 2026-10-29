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
