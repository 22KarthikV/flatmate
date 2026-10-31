"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addItem } from "./actions";
import { ITEM_NAME_MAX, ITEM_NOTE_MAX, type ShoppingFormState } from "./constants";

const initialState: ShoppingFormState = { status: "idle" };

/** One field and a button; an optional note for "semi-skimmed". Clears itself after an item is added. */
export function AddItemForm() {
  const [state, formAction, pending] = useActionState(addItem, initialState);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "saved") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-4">
      <Input
        label="What does the flat need?"
        name="name"
        maxLength={ITEM_NAME_MAX}
        autoComplete="off"
        placeholder="Toilet roll"
        required
      />
      <Input
        label="Note (optional)"
        name="note"
        maxLength={ITEM_NOTE_MAX}
        autoComplete="off"
        placeholder="The big pack"
      />
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding" : "Add to list"}
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
