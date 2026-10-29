"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { openInvite } from "./actions";
import type { SimpleState } from "./constants";

const initialState: SimpleState = { status: "idle" };

/** For the person who was sent a link but opened FlatMate directly: paste it here. */
export function OpenInviteForm() {
  const [state, formAction, pending] = useActionState(openInvite, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Paste the link here"
        name="link"
        required
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="url"
        aria-invalid={state.status === "error"}
      />
      <div className="flex min-h-11 items-center gap-4">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Opening" : "Open invite"}
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
