// Turns the database's inputs for one flat and week into the assignments to store (SPEC-rota T1,
// T10). Pure: it runs in the Next.js app for "Generate now" and, as a copy, in the rota-generate
// Edge Function. Everything it imports is pure and uses relative paths so the copy works unchanged.

import type { OwedChange, PastWeek } from "./fairness";
import { carriedLoads } from "./fairness";
import { buildWeek, type ScheduleChore } from "./schedule";

/** The document public.rota_generation_input returns. */
export interface GenerationInput {
  members: string[];
  chores: ScheduleChore[];
  availability: Record<string, Record<string, boolean>>;
  lastDone: Record<string, Record<string, string>>;
  owed: Record<string, Record<string, number>>;
  history: PastWeek[];
}

export interface PlannedAssignment {
  choreId: string;
  assignee: string | null;
  dueOn: string;
  explanation: string;
}

export interface PlannedWeek {
  assignments: PlannedAssignment[];
  owed: OwedChange[];
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
export function parseGenerationInput(raw: unknown): GenerationInput {
  const doc = record<unknown>(raw);
  return {
    members: list<string>(doc.members),
    chores: list<ScheduleChore>(doc.chores),
    availability: record<Record<string, boolean>>(doc.availability),
    lastDone: record<Record<string, string>>(doc.lastDone),
    owed: record<Record<string, number>>(doc.owed),
    history: list<PastWeek>(doc.history),
  };
}

/** Runs the scheduler for a week and shapes its answer for public.store_rota_week. */
export function planWeek(weekStart: string, input: GenerationInput): PlannedWeek {
  const result = buildWeek({
    weekStart,
    members: input.members,
    chores: input.chores,
    availability: input.availability,
    carriedLoad: carriedLoads(input.members, input.history),
    lastDone: input.lastDone,
    owed: input.owed,
  });
  return {
    assignments: result.assignments.map((a) => ({
      choreId: a.choreId,
      assignee: a.assignee,
      dueOn: a.dueOn,
      explanation: a.explanation,
    })),
    owed: result.owedChanges,
  };
}
