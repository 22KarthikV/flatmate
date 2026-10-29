"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createHousehold } from "./actions";
import { HOUSEHOLD_NAME_MAX, type CreateFlatState } from "./constants";

const initialState: CreateFlatState = { status: "idle" };

export function CreateFlatForm() {
  const [state, formAction, pending] = useActionState(createHousehold, initialState);
  const hasError = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Flat name"
        name="name"
        maxLength={HOUSEHOLD_NAME_MAX}
        required
        autoComplete="off"
        placeholder="Flat 12, Marchmont Road"
        hint="Your flatmates see this when they join."
        aria-invalid={hasError}
      />
      <div className="flex min-h-11 items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating" : "Create flat"}
        </Button>
        {hasError ? (
          <p role="alert" className="text-negative text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
