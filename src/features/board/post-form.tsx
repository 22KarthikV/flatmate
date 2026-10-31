"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { postNote } from "./actions";
import { DEFAULT_EXPIRY_DAYS, EXPIRY_CHOICES, POST_MAX, type BoardFormState } from "./constants";

const initialState: BoardFormState = { status: "idle" };

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

/** A box for a short note, how long it stays up, and (for admins) a pin. Clears once posted. */
export function PostForm({ isAdmin }: { isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState(postNote, initialState);
  const [length, setLength] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "saved") form.current?.reset();
  }, [state]);

  return (
    <form
      ref={form}
      action={formAction}
      onReset={() => setLength(0)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="board-body" className="label-caps text-muted">
          Post a note to the flat
        </label>
        <textarea
          id="board-body"
          name="body"
          rows={3}
          maxLength={POST_MAX}
          onChange={(event) => setLength(event.target.value.length)}
          placeholder="Landlord visiting Thursday 10am"
          required
          className="border-ink text-ink placeholder:text-muted min-h-24 w-full border bg-transparent p-3 text-base focus-visible:outline-offset-4"
        />
        <p className="text-muted text-sm" aria-live="polite">
          {length} of {POST_MAX}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="board-days" className="label-caps text-muted">
          Stays up for
        </label>
        <select
          id="board-days"
          name="days"
          defaultValue={DEFAULT_EXPIRY_DAYS}
          className={selectClass}
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice.days} value={choice.days}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>
      {isAdmin ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" name="pin" className="accent-ink size-6" />
          <span>Pin it (stays until you unpin it, good for house rules)</span>
        </label>
      ) : null}
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Posting" : "Post"}
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
