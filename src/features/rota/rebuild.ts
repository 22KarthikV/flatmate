// Turns the database's document for one leaver into the moves to apply (SPEC-rota T15). Pure, with
// relative imports only, so it runs in the app's tests and, as a copy, in the rota-generate Edge
// Function next to the scheduler.

import { carriedLoads, type PastWeek } from "./fairness";
import { rebalanceAfterLeave, type RebalanceInput, type RebalanceTask } from "./rebalance";

/** The document public.rota_rebuild_input returns. */
export interface RebuildDocument {
  leaver: string;
  leaverName: string;
  cause: "left" | "away";
  remaining: string[];
  tasks: RebalanceTask[];
  availability: Record<string, Record<string, boolean>>;
  lastDone: Record<string, Record<string, string>>;
  history: PastWeek[];
}

/** One chore handed to someone (or to nobody), in the shape public.rota_apply_rebuild takes. */
export interface PlannedMove {
  taskId: string;
  to: string | null;
  reason: "leaver" | "balance";
  explanation: string;
}

function record<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Reads the json from the database, tolerating missing parts so a thin flat never throws. */
export function parseRebuildDocument(raw: unknown): RebuildDocument {
  const doc = record<unknown>(raw);
  return {
    leaver: typeof doc.leaver === "string" ? doc.leaver : "",
    leaverName: typeof doc.leaverName === "string" ? doc.leaverName : "Someone",
    cause: doc.cause === "away" ? "away" : "left",
    remaining: list<string>(doc.remaining),
    tasks: list<RebalanceTask>(doc.tasks),
    availability: record<Record<string, boolean>>(doc.availability),
    lastDone: record<Record<string, string>>(doc.lastDone),
    history: list<PastWeek>(doc.history),
  };
}

export function toRebalanceInput(doc: RebuildDocument): RebalanceInput {
  return {
    leaver: doc.leaver,
    leaverName: doc.leaverName,
    cause: doc.cause,
    remaining: doc.remaining,
    tasks: doc.tasks,
    availability: doc.availability,
    carriedLoad: carriedLoads(doc.remaining, doc.history),
    lastDone: doc.lastDone,
  };
}

/** The moves to store for one leaver. Empty when they held nothing upcoming. */
export function planRebuild(raw: unknown): PlannedMove[] {
  const result = rebalanceAfterLeave(toRebalanceInput(parseRebuildDocument(raw)));
  return result.moves.map((m) => ({
    taskId: m.taskId,
    to: m.to,
    reason: m.reason,
    explanation: m.explanation,
  }));
}
