"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";

import { reassignChore, requestSwap } from "./actions";
import type { GenerateFormState } from "./constants";
import type { SwapOption } from "./swap-options";

const initialState: GenerateFormState = { status: "idle" };

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

function Message({ state }: { state: GenerateFormState }) {
  if (state.status === "error") {
    return (
      <p role="alert" className="text-negative">
        {state.message}
      </p>
    );
  }
  if (state.status === "saved") return <p role="status">{state.message}</p>;
  return null;
}

/**
 * Ask a flatmate to take your chore, or to swap it for one of theirs. Only people who are around
 * that day are offered. Nothing changes until they accept.
 */
export function SwapSheet({
  assignmentId,
  options,
}: {
  assignmentId: string;
  options: SwapOption[];
}) {
  const [state, formAction, pending] = useActionState(requestSwap, initialState);
  const [person, setPerson] = useState(options[0]?.profileId ?? "");
  const chosen = options.find((option) => option.profileId === person);

  if (options.length === 0) {
    return <p className="text-muted">Nobody else is around that day, so there is no one to ask.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <div className="flex flex-col gap-2">
        <label htmlFor="swap-person" className="label-caps text-muted">
          Ask
        </label>
        <select
          id="swap-person"
          name="toProfile"
          value={person}
          onChange={(event) => setPerson(event.target.value)}
          className={selectClass}
        >
          {options.map((option) => (
            <option key={option.profileId} value={option.profileId}>
              {option.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="swap-return" className="label-caps text-muted">
          In return, I take
        </label>
        <select id="swap-return" name="inReturnId" className={selectClass} key={person}>
          <option value="">Nothing, just take it</option>
          {chosen?.exchanges.map((exchange) => (
            <option key={exchange.assignmentId} value={exchange.assignmentId}>
              {exchange.label}
            </option>
          ))}
        </select>
      </div>
      <Message state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Asking…" : "Ask to swap"}
        </Button>
      </div>
    </form>
  );
}

/** Owners and admins: move the chore to someone directly. Their name goes on the record. */
export function ReassignForm({
  assignmentId,
  people,
}: {
  assignmentId: string;
  people: { profileId: string; displayName: string }[];
}) {
  const [state, formAction, pending] = useActionState(reassignChore, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <div className="flex flex-col gap-2">
        <label htmlFor="reassign-person" className="label-caps text-muted">
          Give it to
        </label>
        <select id="reassign-person" name="toProfile" className={selectClass}>
          {people.map((person) => (
            <option key={person.profileId} value={person.profileId}>
              {person.displayName}
            </option>
          ))}
        </select>
        <p className="text-muted text-sm">
          This happens straight away, even if they are away that day. Your name is kept on it.
        </p>
      </div>
      <Message state={state} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Moving…" : "Move it"}
        </Button>
      </div>
    </form>
  );
}
