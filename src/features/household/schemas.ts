import { z } from "zod";

import { HOUSEHOLD_NAME_MAX } from "./constants";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const householdNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter a name for your flat.")
      .max(HOUSEHOLD_NAME_MAX, `Use ${HOUSEHOLD_NAME_MAX} characters or fewer.`),
  );

export type HouseholdNameResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validates a flat name typed into a form. The database repeats the length check; this gives the
 * person a clear message first. Control characters are checked on the raw value, because
 * trimming would otherwise hide a trailing one.
 */
export function parseHouseholdName(input: FormDataEntryValue | null): HouseholdNameResult {
  if (typeof input !== "string") return { ok: false, error: "Enter a name for your flat." };
  if (CONTROL_CHARACTERS.test(input.trim())) {
    return { ok: false, error: "Use letters, numbers and ordinary punctuation only." };
  }

  const result = householdNameSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? "Enter a name for your flat." };
}
