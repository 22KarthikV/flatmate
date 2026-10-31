"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

import { ExpenseList } from "./expense-list";
import type { ExpenseRow } from "./expenses";

export type ExpenseView = "active" | "cancelled" | "all";

const OPTIONS: { value: ExpenseView; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

/** Active = still counting; cancelled = cancelled, or replaced by a corrected version. */
export function filterExpenses(items: ExpenseRow[], view: ExpenseView): ExpenseRow[] {
  if (view === "all") return items;
  return items.filter((item) => item.voided === (view === "cancelled"));
}

/** The expense list with a switch between active, cancelled and all, so cancelled ones do not crowd the page. */
export function ExpenseFilter({
  items,
  viewerId,
  initial = "active",
}: {
  items: ExpenseRow[];
  viewerId: string;
  initial?: ExpenseView;
}) {
  const [view, setView] = useState<ExpenseView>(initial);
  const shown = filterExpenses(items, view);

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Show expenses" className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={view === option.value}
            onClick={() => setView(option.value)}
            className={cn(
              "label-caps border-ink min-h-11 flex-1 border px-3 transition-colors duration-200",
              view === option.value
                ? "bg-ink text-paper"
                : "text-ink hover:bg-ink hover:text-paper",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {shown.length === 0 && items.length > 0 ? (
        <p className="text-muted max-w-md text-sm">
          {view === "cancelled" ? "No cancelled expenses." : "No active expenses."}
        </p>
      ) : (
        <ExpenseList items={shown} viewerId={viewerId} />
      )}
    </div>
  );
}
