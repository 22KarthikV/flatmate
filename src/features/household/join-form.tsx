"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { joinHousehold } from "./actions";
import type { SimpleState } from "./constants";

const initialState: SimpleState = { status: "idle" };

/** Joining is a button press (a POST), never a side effect of opening the link. */
export function JoinForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(joinHousehold, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex min-h-11 items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Joining" : "Join"}
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
