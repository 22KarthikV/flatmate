// Kept free of server-only imports so client components can use it.

export const LABEL_MAX = 30;
export const NOTE_MAX = 100;
export const VALUE_MAX = 9_999_999.999;

export const KINDS = [
  { id: "electricity", label: "Electricity" },
  { id: "gas", label: "Gas" },
  { id: "water", label: "Water" },
] as const;

export type MeterKind = (typeof KINDS)[number]["id"];
export type MeterUnit = "kWh" | "m3";

export function kindLabel(kind: string): string {
  return KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export function meterTitle(meter: { kind: string; label: string | null }): string {
  return meter.label ? `${kindLabel(meter.kind)} (${meter.label})` : kindLabel(meter.kind);
}

/** Electricity is always kWh; gas and water meters differ. */
export function unitOptions(kind: string): MeterUnit[] {
  return kind === "electricity" ? ["kWh"] : ["kWh", "m3"];
}

export type MeterFormState =
  | { status: "idle" }
  | { status: "saved" }
  /** `askReset` is set when the number is lower than the last reading, so the form can ask. */
  | { status: "error"; message: string; askReset?: boolean };
