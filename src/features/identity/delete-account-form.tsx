"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { deleteAccount } from "./actions";
import { DELETE_PHRASE, isDeleteConfirmed, type DeleteState } from "./delete-account";

const initialState: DeleteState = { status: "idle" };

export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);

  if (!open) {
    return (
      <Button variant="ghost" className="text-negative" onClick={() => setOpen(true)}>
        Delete account
      </Button>
    );
  }

  return (
    <form action={formAction} className="border-negative flex flex-col gap-4 border p-4">
      <p className="max-w-md text-sm">
        This can&rsquo;t be undone. Your name and photo are removed and you are signed out
        everywhere. Anything you added to the flat, such as expenses, stays for your flatmates under
        &ldquo;Deleted user&rdquo;, and your upcoming chores and shares are shared out among the
        people who remain.
      </p>
      <Input
        label={`Type ${DELETE_PHRASE} to confirm`}
        name="confirmation"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={state.status === "error"}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          className="bg-negative"
          disabled={pending || !isDeleteConfirmed(typed)}
        >
          {pending ? "Deleting" : "Delete my account"}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          Cancel
        </Button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-negative text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
