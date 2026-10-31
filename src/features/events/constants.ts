// Kept free of server-only imports so client components can use it.

export type EventFormState =
  { status: "idle" } | { status: "error"; message: string } | { status: "saved"; message: string };
