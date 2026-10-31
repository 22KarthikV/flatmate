"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { reportFix } from "./actions";
import { DETAILS_MAX, LOCATION_MAX, TITLE_MAX, type FixFormState } from "./constants";

const initialState: FixFormState = { status: "idle" };

/** Title, details and room. On success the action opens the new report. */
export function FixForm() {
  const [state, formAction, pending] = useActionState(reportFix, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Input
        label="What is wrong?"
        name="title"
        maxLength={TITLE_MAX}
        autoComplete="off"
        placeholder="Bathroom extractor fan not working"
        required
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="fix-details" className="label-caps text-muted">
          Details (optional)
        </label>
        <textarea
          id="fix-details"
          name="details"
          rows={3}
          maxLength={DETAILS_MAX}
          className="border-ink text-ink min-h-24 w-full border bg-transparent p-3 text-base focus-visible:outline-offset-4"
        />
      </div>
      <Input
        label="Room (optional)"
        name="location"
        maxLength={LOCATION_MAX}
        autoComplete="off"
        placeholder="Bathroom"
      />
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Reporting" : "Report problem"}
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
