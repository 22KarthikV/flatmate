// Kept free of server-only imports. The form and the server action read a chore the same way; the
// database checks it again, so this is for clear messages, not for trust.

import { z } from "zod";

import { CHECKLIST_ITEM_MAX, CHECKLIST_MAX_ITEMS, CHORE_NAME_MAX, type Cadence } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id from a URL or a form, or null when it is not a uuid. */
export function parseChoreId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

const choreSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the chore a name.")
    .max(CHORE_NAME_MAX, `Use ${CHORE_NAME_MAX} characters or fewer for the name.`),
  cadence: z.enum(["weekly", "every_n_days"]),
  preferredDow: z.string(),
  everyNDays: z.string(),
  effort: z.coerce.number().int().min(1).max(5),
  needsSignoff: z.boolean(),
  items: z
    .array(
      z
        .string()
        .max(CHECKLIST_ITEM_MAX, `Each step can be up to ${CHECKLIST_ITEM_MAX} characters.`),
    )
    .max(CHECKLIST_MAX_ITEMS, `A chore can have up to ${CHECKLIST_MAX_ITEMS} steps.`),
});

export interface ChoreInput {
  name: string;
  cadence: Cadence;
  preferredDow: number | null;
  everyNDays: number | null;
  effort: number;
  needsSignoff: boolean;
  items: string[];
}

export type ParsedChore = { ok: true; value: ChoreInput } | { ok: false; message: string };

/** Everything the form holds, as plain text, before any of it is checked. */
export interface RawChore {
  name: string;
  cadence: string;
  preferredDow: string;
  everyNDays: string;
  effort: string;
  needsSignoff: boolean;
  items: string[];
}

export function rawChoreFromFormData(formData: FormData): RawChore {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    cadence: text("cadence"),
    preferredDow: text("preferredDow"),
    everyNDays: text("everyNDays"),
    effort: text("effort"),
    needsSignoff: formData.get("needsSignoff") === "on",
    items: formData.getAll("item").filter((value): value is string => typeof value === "string"),
  };
}

/** Checks what was typed. Blank steps are dropped, since an empty row in the form means nothing. */
export function parseChoreFields(raw: RawChore): ParsedChore {
  const items = raw.items.map((item) => item.trim()).filter((item) => item.length > 0);
  const result = choreSchema.safeParse({ ...raw, items });
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue?.path[0] === "cadence") return { ok: false, message: "Choose how often it happens." };
    if (issue?.path[0] === "effort") return { ok: false, message: "Choose an effort from 1 to 5." };
    return { ok: false, message: issue?.message ?? "Check the chore and try again." };
  }
  const value = result.data;

  if (value.cadence === "weekly") {
    const dow = Number(value.preferredDow);
    if (value.preferredDow === "" || !Number.isInteger(dow) || dow < 0 || dow > 6) {
      return { ok: false, message: "Choose the day of the week it is usually done." };
    }
    return {
      ok: true,
      value: {
        name: value.name,
        cadence: "weekly",
        preferredDow: dow,
        everyNDays: null,
        effort: value.effort,
        needsSignoff: value.needsSignoff,
        items: value.items,
      },
    };
  }

  const every = Number(value.everyNDays);
  if (value.everyNDays === "" || !Number.isInteger(every) || every < 1 || every > 14) {
    return { ok: false, message: "Choose a number of days from 1 to 14." };
  }
  return {
    ok: true,
    value: {
      name: value.name,
      cadence: "every_n_days",
      preferredDow: null,
      everyNDays: every,
      effort: value.effort,
      needsSignoff: value.needsSignoff,
      items: value.items,
    },
  };
}
