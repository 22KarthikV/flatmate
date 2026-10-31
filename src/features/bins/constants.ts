// Kept free of server-only imports so client components can use it.

export const BIN_NAME_MAX = 40;
export const NOTE_MAX = 60;

export const COLOURS = [
  { id: "grey", label: "Grey", hex: "#8a8a8a" },
  { id: "blue", label: "Blue", hex: "#2f6bd0" },
  { id: "green", label: "Green", hex: "#3c8a4a" },
  { id: "brown", label: "Brown", hex: "#7a5236" },
  { id: "black", label: "Black", hex: "#1a1a1a" },
  { id: "red", label: "Red", hex: "#c0392b" },
  { id: "purple", label: "Purple", hex: "#7b4bb0" },
  { id: "other", label: "Other", hex: "#bdbdbd" },
] as const;

export const EVERY_WEEKS = [
  { id: 1, label: "Every week" },
  { id: 2, label: "Every 2 weeks" },
  { id: 3, label: "Every 3 weeks" },
  { id: 4, label: "Every 4 weeks" },
] as const;

export type BinFormState =
  { status: "idle" } | { status: "saved" } | { status: "error"; message: string };
