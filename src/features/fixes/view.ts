// Pure wording and grouping for the fix-it log.

import { STATUSES, type FixStatus } from "./constants";

export interface FixReport {
  id: string;
  title: string;
  details: string | null;
  location: string | null;
  status: FixStatus;
  reportedBy: string;
  reporterName: string;
  chaserId: string | null;
  chaserName: string | null;
  createdAt: string;
  lastActivityAt: string;
}

export interface FixUpdate {
  id: string;
  kind: "note" | "status" | "chaser" | "system";
  body: string;
  authorName: string;
  createdAt: string;
}

export function statusLabel(status: FixStatus): string {
  return STATUSES.find((s) => s.id === status)?.label ?? status;
}

export function chasingText(report: {
  chaserId: string | null;
  chaserName: string | null;
}): string {
  return report.chaserId === null ? "Nobody chasing" : `Chasing: ${report.chaserName ?? "Someone"}`;
}

/** Open first, then in progress, then fixed; newest first inside each. */
export function groupReports(reports: FixReport[]): {
  open: FixReport[];
  inProgress: FixReport[];
  fixed: FixReport[];
} {
  const newestFirst = (a: FixReport, b: FixReport) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  return {
    open: reports.filter((r) => r.status === "open").sort(newestFirst),
    inProgress: reports.filter((r) => r.status === "in_progress").sort(newestFirst),
    fixed: reports.filter((r) => r.status === "fixed").sort(newestFirst),
  };
}

const DAY_MS = 86_400_000;

/** "just now", "3 hours ago", "yesterday", "9 days ago". */
export function ageText(from: string, now: string): string {
  const ms = Date.parse(now) - Date.parse(from);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(ms / DAY_MS);
  return days <= 1 ? "yesterday" : `${days} days ago`;
}
