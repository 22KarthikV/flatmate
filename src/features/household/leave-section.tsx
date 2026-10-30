"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { closeHousehold, leaveHousehold, transferOwnership } from "./actions";
import type { HouseholdRole, SimpleState } from "./constants";

const initial: SimpleState = { status: "idle" };

export interface Candidate {
  profileId: string;
  displayName: string;
}

function ErrorLine({ state }: { state: SimpleState }) {
  return state.status === "error" ? (
    <p role="alert" className="text-negative text-sm">
      {state.message}
    </p>
  ) : null;
}

/**
 * Leaving, handing over and closing. Who sees what mirrors the database rules: the owner cannot
 * leave while others remain (hand over first), and can close only when alone.
 */
export function LeaveSection({
  role,
  others,
  moneyOpen = false,
}: {
  role: HouseholdRole;
  /** Everyone else currently in the flat. */
  others: Candidate[];
  /** The person owes or is owed money, or has a payment waiting, so they cannot leave yet. */
  moneyOpen?: boolean;
}) {
  const [leaveState, leaveAction, leaving] = useActionState(leaveHousehold, initial);
  const [transferState, transferAction, transferring] = useActionState(transferOwnership, initial);
  const [closeState, closeAction, closing] = useActionState(closeHousehold, initial);
  const [confirm, setConfirm] = useState<"leave" | "close" | null>(null);

  const isOwner = role === "owner";
  const alone = others.length === 0;

  return (
    <Card>
      <CardLabel>Leaving</CardLabel>

      {isOwner && !alone ? (
        <form action={transferAction} className="mt-4 flex flex-col gap-3">
          <p className="max-w-md text-sm">
            You&rsquo;re the owner. To leave, hand the flat to someone else first. You&rsquo;ll stay
            on as an admin.
          </p>
          <label htmlFor="new-owner" className="label-caps text-muted">
            New owner
          </label>
          <select
            id="new-owner"
            name="profileId"
            required
            defaultValue=""
            className="border-ink min-h-11 border-0 border-b bg-transparent px-0 text-base"
          >
            <option value="" disabled>
              Choose a flatmate
            </option>
            {others.map((person) => (
              <option key={person.profileId} value={person.profileId}>
                {person.displayName}
              </option>
            ))}
          </select>
          <div>
            <Button type="submit" variant="secondary" disabled={transferring}>
              {transferring ? "Handing over" : "Hand over ownership"}
            </Button>
          </div>
          <ErrorLine state={transferState} />
        </form>
      ) : null}

      {!isOwner ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="max-w-md text-sm">
            Leaving keeps your past expenses in the flat&rsquo;s history. Your upcoming chores are
            shared out among the people who stay.
          </p>
          {moneyOpen ? (
            <p role="status" className="border-line max-w-md border p-4 text-sm">
              You can&rsquo;t leave yet: you still owe, or are owed, money in this flat, or have a
              payment waiting for a decision. Settle up on the{" "}
              <Link href="/money" className="underline underline-offset-4">
                Money screen
              </Link>{" "}
              first, then you can leave.
            </p>
          ) : confirm === "leave" ? (
            <form action={leaveAction} className="border-negative flex flex-col gap-3 border p-4">
              <p className="text-sm">Leave this flat?</p>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="bg-negative" disabled={leaving}>
                  {leaving ? "Leaving" : "Leave flat"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <Button variant="ghost" className="text-negative" onClick={() => setConfirm("leave")}>
                Leave flat
              </Button>
            </div>
          )}
          <ErrorLine state={leaveState} />
        </div>
      ) : null}

      {isOwner && alone ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="max-w-md text-sm">
            You&rsquo;re the only one here. You can close the flat; invite links stop working and
            you can start a new one any time.
          </p>
          {confirm === "close" ? (
            <form action={closeAction} className="border-negative flex flex-col gap-3 border p-4">
              <p className="text-sm">Close this flat?</p>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="bg-negative" disabled={closing}>
                  {closing ? "Closing" : "Close flat"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <Button variant="ghost" className="text-negative" onClick={() => setConfirm("close")}>
                Close flat
              </Button>
            </div>
          )}
          <ErrorLine state={closeState} />
        </div>
      ) : null}
    </Card>
  );
}
