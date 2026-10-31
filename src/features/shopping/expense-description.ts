import { DESCRIPTION_MAX } from "@/features/ledger/constants";

/** "Shopping: milk, bin bags", cut to the ledger's 80 characters with a "+N more" suffix. */
export function shoppingDescription(names: string[]): string {
  if (names.length === 0) return "Shopping";
  const all = `Shopping: ${names.join(", ")}`;
  if (all.length <= DESCRIPTION_MAX) return all;

  for (let shown = names.length - 1; shown >= 1; shown--) {
    const text = `Shopping: ${names.slice(0, shown).join(", ")} +${names.length - shown} more`;
    if (text.length <= DESCRIPTION_MAX) return text;
  }
  return all.slice(0, DESCRIPTION_MAX - 1) + "…";
}
