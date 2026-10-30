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
      "nudge_after_days",
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

  it("covers every column of the notification tables as they stand today", () => {
    expect(columnsOf("notifications")).toEqual([
      "body",
      "created_at",
      "dedupe_key",
      "household_id",
      "href",
      "id",
      "read_at",
      "recipient_id",
      "snoozed_until",
      "title",
      "type",
    ]);
    expect(columnsOf("notification_preferences")).toEqual(["in_app", "profile_id", "push", "type"]);
    expect(columnsOf("push_subscriptions")).toEqual([
      "auth",
      "created_at",
      "endpoint",
      "failed_at",
      "id",
      "last_success_at",
      "p256dh",
      "profile_id",
      "user_agent",
    ]);
    expect(columnsOf("push_outbox")).toEqual([
      "attempts",
      "id",
      "last_error",
      "next_attempt_at",
      "notification_id",
      "sent_at",
      "subscription_id",
    ]);
  });

  it("covers every column of the ledger tables as they stand today", () => {
    // The notice is updated to describe them when the first screen that fills them ships.
    expect(columnsOf("expenses")).toEqual([
      "amount_pence",
      "category",
      "created_at",
      "created_by",
      "description",
      "household_id",
      "id",
      "occurred_on",
      "paid_by",
      "replaces_id",
      "voided_at",
      "voided_by",
    ]);
    expect(columnsOf("expense_shares")).toEqual([
      "expense_id",
      "household_id",
      "profile_id",
      "share_pence",
    ]);
    expect(columnsOf("settlements")).toEqual([
      "amount_pence",
      "confirmed_by",
      "created_at",
      "decided_at",
      "from_profile",
      "household_id",
      "id",
      "status",
      "to_profile",
    ]);
  });

  it("explains notifications and push: what is kept, for how long, and what deletion does", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";

    for (const phrase of [
      "What we store about your notifications",
      "Only you can see your own",
      "read ones are deleted after 90 days",
      "push address",
      "encryption keys",
      "Safari on iPhone",
      "only a title, one short line and a link",
      "14 days",
      "turn push off for one device",
      "Apple, Google, Microsoft or Mozilla",
      "Messages other people already received about you will say",
    ]) {
      expect(text, `the notice should mention "${phrase}"`).toContain(phrase);
    }
  });

  it("explains the shared money records, who sees them and what is never changed", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";

    for (const phrase of [
      "What we store about shared money",
      "each person’s share of it",
      "whether the person receiving it confirmed it",
      "nobody outside it can",
      "never touches money",
      "never asks for card or bank details",
      "keeps the earlier version in its history",
      "never in a push to your phone",
    ]) {
      expect(text, `the notice should mention "${phrase}"`).toContain(phrase);
    }
  });

  it("covers every column of the recurring rent and bills tables as they stand today", () => {
    expect(columnsOf("recurring_templates")).toEqual([
      "active_months",
      "amount_mode",
      "amount_pence",
      "created_at",
      "created_by",
      "due_day",
      "ended_at",
      "household_id",
      "id",
      "kind",
      "name",
      "paid_by",
      "paused_at",
      "paused_reason",
      "split_mode",
      "updated_at",
    ]);
    expect(columnsOf("recurring_rooms")).toEqual([
      "household_id",
      "id",
      "name",
      "rent_pence",
      "template_id",
    ]);
    expect(columnsOf("recurring_template_shares")).toEqual([
      "household_id",
      "profile_id",
      "room_id",
      "share_value",
      "template_id",
    ]);
    expect(columnsOf("recurring_instances")).toEqual([
      "created_at",
      "due_on",
      "expense_id",
      "household_id",
      "id",
      "period",
      "status",
      "template_id",
    ]);
    expect(columnsOf("rent_charges")).toEqual([
      "amount_pence",
      "collector_id",
      "created_at",
      "due_on",
      "household_id",
      "id",
      "instance_id",
      "period",
      "profile_id",
      "room_name",
      "template_id",
    ]);
    expect(columnsOf("rent_payments")).toEqual([
      "amount_pence",
      "collector_id",
      "created_at",
      "decided_at",
      "decided_by",
      "household_id",
      "id",
      "kind",
      "payer_id",
      "reason",
      "status",
      "template_id",
      "voided_at",
      "voided_by",
    ]);
    expect(columnsOf("recurring_template_log")).toEqual([
      "change",
      "changed_by",
      "created_at",
      "detail",
      "household_id",
      "id",
      "template_id",
    ]);
  });

  it("explains rent and bills, who sees rent, and what is kept", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";

    for (const phrase of [
      "What we store about rent and bills",
      "the rooms with their rent",
      "Rent is private",
      "you can see only your own rent and payments",
      "The person who collects the rent and the flat’s owner and admins can see everyone’s",
      "Deleted user",
      "never in a push to your phone",
    ]) {
      expect(text, `the notice should mention "${phrase}"`).toContain(phrase);
    }
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
