"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { updateDisplayName } from "./actions";
import { DISPLAY_NAME_MAX, type RenameState } from "./profile-constants";

const initialState: RenameState = { status: "idle" };

export function RenameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(updateDisplayName, initialState);
  const hasError = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Display name"
        name="displayName"
        defaultValue={currentName}
        maxLength={DISPLAY_NAME_MAX}
        required
        autoComplete="nickname"
        hint="This is the name your flatmates see."
        aria-invalid={hasError}
      />
      <div className="flex min-h-11 items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>
        {state.status === "saved" ? (
          <p role="status" className="text-positive text-sm">
            {state.message}
          </p>
        ) : null}
        {hasError ? (
          <p role="alert" className="text-negative text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
