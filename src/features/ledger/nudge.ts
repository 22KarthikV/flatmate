// Kept free of server-only imports so the settings form can use it.

export type NudgeValue = "off" | "3" | "7" | "14";

export const NUDGE_CHOICES: readonly { value: NudgeValue; label: string }[] = [
  { value: "off", label: "Never" },
  { value: "3", label: "After 3 days" },
  { value: "7", label: "After 7 days (usual)" },
  { value: "14", label: "After 14 days" },
];

const DAYS: Record<NudgeValue, number | null> = { off: null, "3": 3, "7": 7, "14": 14 };

/** What the form posted, as days (null for never), or not ok. The database checks it again. */
export function parseNudgeChoice(
  value: unknown,
): { ok: true; days: number | null } | { ok: false } {
  if (typeof value !== "string" || !Object.hasOwn(DAYS, value)) return { ok: false };
  return { ok: true, days: DAYS[value as NudgeValue] };
}

/** The form value for a saved setting. Anything unexpected shows the usual 7 days. */
export function nudgeValue(days: number | null | undefined): NudgeValue {
  if (days === null) return "off";
  return days === 3 || days === 7 || days === 14 ? (String(days) as NudgeValue) : "7";
}

export type NudgeState =
  { status: "idle" } | { status: "saved" } | { status: "error"; message: string };
