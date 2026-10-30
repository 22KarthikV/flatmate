// Kept free of server-only imports: the add-expense form uses this to show each person's share as
// you type, and the server action uses the very same code to decide what is saved. The database
// checks everything again, so this is for clear messages, not for trust.

import { DESCRIPTION_MAX, isCategory } from "./constants";
import { parsePounds } from "./money";
import { splitExpense, type Share, type SplitInput } from "./splits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An expense id from a URL or a form, or null when it is not a uuid. */
export function parseExpenseId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** Everything the form holds, as plain text, before any of it is checked. */
export interface RawExpense {
  amount: string;
  description: string;
  category: string;
  /** yyyy-mm-dd */
  occurredOn: string;
  paidBy: string;
  mode: string;
  /** Equal split: who is ticked. */
  who: string[];
  /** By amounts: pounds typed against each person's id. */
  exact: Record<string, string>;
  /** By percentages: a percentage typed against each person's id. */
  percent: Record<string, string>;
  /** One person: who it is for. */
  one: string;
}

export type ParsedPercent = { ok: true; basisPoints: number } | { ok: false; message: string };

/** "33.33", "50", "12.5%" as hundredths of a percent. */
export function parsePercent(input: string): ParsedPercent {
  const text = input.trim().replace(/%$/, "").trim();
  if (/^\d+\.\d{3,}$/.test(text)) {
    return { ok: false, message: "Use at most two decimal places for a percentage." };
  }
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return { ok: false, message: "Enter a percentage like 33.33." };
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (basisPoints > 10_000) return { ok: false, message: "A percentage can't be more than 100." };
  return { ok: true, basisPoints };
}

const NOT_IN_FLAT = "Choose from the people in your flat.";

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });

/** A typed share amount: blank or zero means "nothing"; anything else must be a proper amount. */
function parseShareAmount(text: string): { ok: true; pence: number } | Fail {
  if (/^\s*£?\s*0*(\.0{1,2})?\s*$/.test(text)) return { ok: true, pence: 0 };
  return parsePounds(text);
}

export type BuiltSplit = { ok: true; amountPence: number; shares: Share[] } | Fail;

/** The amount and the split mode turned into per-person shares in pence, or a message. */
export function buildSplit(raw: RawExpense, memberIds: string[]): BuiltSplit {
  const amount = parsePounds(raw.amount);
  if (!amount.ok) return amount;
  const amountPence = amount.pence;
  const isMember = (id: string) => memberIds.includes(id);

  let input: SplitInput;
  switch (raw.mode) {
    case "equal": {
      if (!raw.who.every(isMember)) return fail(NOT_IN_FLAT);
      input = { mode: "equal", amountPence, profileIds: raw.who };
      break;
    }
    case "one": {
      if (raw.one !== "" && !isMember(raw.one)) return fail(NOT_IN_FLAT);
      input = { mode: "one", amountPence, profileId: raw.one };
      break;
    }
    case "exact": {
      if (!Object.keys(raw.exact).every(isMember)) return fail(NOT_IN_FLAT);
      const shares: { profileId: string; pence: number }[] = [];
      for (const [profileId, text] of Object.entries(raw.exact)) {
        if (text.trim() === "") continue;
        const parsed = parseShareAmount(text);
        if (!parsed.ok) return parsed;
        shares.push({ profileId, pence: parsed.pence });
      }
      input = { mode: "exact", amountPence, shares };
      break;
    }
    case "percent": {
      if (!Object.keys(raw.percent).every(isMember)) return fail(NOT_IN_FLAT);
      const shares: { profileId: string; basisPoints: number }[] = [];
      for (const [profileId, text] of Object.entries(raw.percent)) {
        if (text.trim() === "") continue;
        const parsed = parsePercent(text);
        if (!parsed.ok) return parsed;
        shares.push({ profileId, basisPoints: parsed.basisPoints });
      }
      input = { mode: "percent", amountPence, shares };
      break;
    }
    default:
      return fail("Choose how to split it.");
  }

  const result = splitExpense(input);
  return result.ok ? { ok: true, amountPence, shares: result.shares } : result;
}

const londonDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as yyyy-mm-dd in London, which is what "today" means to the flat. */
export function londonToday(now: Date = new Date()): string {
  return londonDay.format(now);
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The same day five years earlier; 29 February becomes 28 February, as the database does. */
function fiveYearsBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() - 5);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export interface ParsedExpense {
  amountPence: number;
  description: string;
  category: string;
  occurredOn: string;
  paidBy: string;
  profileIds: string[];
  sharePence: number[];
}

export type ParsedExpenseResult = { ok: true; value: ParsedExpense } | Fail;

/** Checks the whole form. `today` is yyyy-mm-dd in London; dates run from 5 years back to 30 days ahead. */
export function parseExpenseFields(
  raw: RawExpense,
  memberIds: string[],
  today: string,
): ParsedExpenseResult {
  const split = buildSplit(raw, memberIds);
  if (!split.ok) return split;

  const description = raw.description.trim();
  if (description === "") return fail("Add a short description.");
  if (description.length > DESCRIPTION_MAX) {
    return fail(`Keep the description to ${DESCRIPTION_MAX} characters or fewer.`);
  }
  if (!isCategory(raw.category)) return fail("Choose a category.");
  if (!isRealDate(raw.occurredOn)) return fail("Choose the date.");
  if (raw.occurredOn > plusDays(today, 30)) return fail("That date is too far ahead.");
  if (raw.occurredOn < fiveYearsBefore(today)) return fail("That date is too long ago.");
  if (!memberIds.includes(raw.paidBy)) return fail("Choose who paid.");

  return {
    ok: true,
    value: {
      amountPence: split.amountPence,
      description,
      category: raw.category,
      occurredOn: raw.occurredOn,
      paidBy: raw.paidBy,
      profileIds: split.shares.map((share) => share.profileId),
      sharePence: split.shares.map((share) => share.pence),
    },
  };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Reads the posted form into plain text fields. Files and unknown fields are ignored. */
export function rawFromFormData(form: FormData): RawExpense {
  const exact: Record<string, string> = {};
  const percent: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value !== "string") continue;
    if (name.startsWith("exact:")) exact[name.slice("exact:".length)] = value;
    else if (name.startsWith("percent:")) percent[name.slice("percent:".length)] = value;
  }
  return {
    amount: text(form, "amount"),
    description: text(form, "description"),
    category: text(form, "category"),
    occurredOn: text(form, "occurredOn"),
    paidBy: text(form, "paidBy"),
    mode: text(form, "mode"),
    who: form.getAll("who").filter((value): value is string => typeof value === "string"),
    one: text(form, "one"),
    exact,
    percent,
  };
}

export interface InitialSplit {
  mode: "equal" | "exact";
  who: string[];
  exact: Record<string, string>;
}

/**
 * How to show an existing expense in the correction form: as an equal split when the shares are
 * exactly what an equal split would give, otherwise as the exact amounts.
 */
export function deriveInitialSplit(amountPence: number, shares: Share[]): InitialSplit {
  const holders = shares.map((share) => share.profileId);
  const equal = splitExpense({ mode: "equal", amountPence, profileIds: holders });
  const matches =
    equal.ok &&
    equal.shares.length === shares.length &&
    equal.shares.every(
      (share) => shares.find((s) => s.profileId === share.profileId)?.pence === share.pence,
    );
  if (matches) return { mode: "equal", who: holders, exact: {} };
  return {
    mode: "exact",
    who: holders,
    exact: Object.fromEntries(
      shares.map((share) => [share.profileId, (share.pence / 100).toFixed(2)]),
    ),
  };
}
