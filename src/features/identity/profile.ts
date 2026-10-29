import { z } from "zod";

import { DISPLAY_NAME_MAX } from "./profile-constants";

const displayNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter a name.")
      .max(DISPLAY_NAME_MAX, `Use ${DISPLAY_NAME_MAX} characters or fewer.`)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
        message: "Use letters, numbers and ordinary punctuation only.",
      }),
  );

export type DisplayNameResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validates a name typed into the rename form. Control characters are checked on the raw value
 * first, because trimming would otherwise hide a trailing newline.
 */
export function parseDisplayName(input: FormDataEntryValue | null): DisplayNameResult {
  if (typeof input !== "string") return { ok: false, error: "Enter a name." };
  if (/[\u0000-\u001f\u007f]/.test(input.trim())) {
    return { ok: false, error: "Use letters, numbers and ordinary punctuation only." };
  }

  const result = displayNameSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? "Enter a name." };
}
