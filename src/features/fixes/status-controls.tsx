"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { addNote, changeStatus, hideReport, setChaser, takeChase } from "./actions";
import { NOTE_MAX, STATUSES, type FixFormState } from "./constants";
import { canChangeStatus, canHandOver, canHide, canTakeChase, type Viewer } from "./permissions";
import type { FixReport } from "./view";

const initialState: FixFormState = { status: "idle" };

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

function NoteForm({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState(addNote, initialState);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "saved") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="reportId" value={reportId} />
      <label htmlFor="fix-note" className="label-caps text-muted">
        Add a note
      </label>
      <textarea
        id="fix-note"
        name="body"
        rows={2}
        maxLength={NOTE_MAX}
        placeholder="Emailed the agent on Monday, no reply"
        required
        className="border-ink text-ink min-h-16 w-full border bg-transparent p-3 text-base focus-visible:outline-offset-4"
      />
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding" : "Add note"}
        </Button>
        {state.status === "error" ? (
          <p role="alert" className="text-negative text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function StatusForm({ report }: { report: FixReport }) {
  const [state, formAction, pending] = useActionState(changeStatus, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="reportId" value={report.id} />
      <label htmlFor="fix-status" className="label-caps text-muted">
        Status
      </label>
      <select id="fix-status" name="status" defaultValue={report.status} className={selectClass}>
        {STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save status"}
        </Button>
        {state.status === "error" ? (
          <p role="alert" className="text-negative text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Everything a person can do to a report, shown only when the rules allow it (the database
 * enforces the same rules): note, status, "I'll chase this", hand over, and remove for admins.
 */
export function StatusControls({
  report,
  viewer,
  people,
}: {
  report: FixReport;
  viewer: Viewer;
  people: { profileId: string; displayName: string }[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <NoteForm reportId={report.id} />
      {canChangeStatus(report, viewer) ? <StatusForm report={report} /> : null}
      {canTakeChase(report) ? (
        <form action={takeChase}>
          <input type="hidden" name="reportId" value={report.id} />
          <Button type="submit" variant="secondary">
            I&rsquo;ll chase this
          </Button>
        </form>
      ) : null}
      {canHandOver(report, viewer) ? (
        <form action={setChaser} className="flex flex-col gap-3">
          <input type="hidden" name="reportId" value={report.id} />
          <label htmlFor="fix-chaser" className="label-caps text-muted">
            Who is chasing the landlord
          </label>
          <select
            id="fix-chaser"
            name="chaser"
            defaultValue={report.chaserId ?? ""}
            className={selectClass}
          >
            <option value="">Nobody</option>
            {people.map((person) => (
              <option key={person.profileId} value={person.profileId}>
                {person.displayName}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Save
          </Button>
        </form>
      ) : null}
      {canHide(viewer) ? (
        <form action={hideReport}>
          <input type="hidden" name="reportId" value={report.id} />
          <Button type="submit" variant="secondary">
            Remove report
          </Button>
        </form>
      ) : null}
    </div>
  );
}
