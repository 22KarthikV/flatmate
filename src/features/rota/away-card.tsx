"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { endAway, setAway } from "./actions";
import type { AwayPeriod } from "./away";
import type { GenerateFormState } from "./constants";
import { shortDate } from "./week";

const initialState: GenerateFormState = { status: "idle" };

export const AWAY_WORDING = "Away from chores. Rent and bills still apply.";

const fieldClass = "border-line min-h-11 border bg-transparent px-2";

function range(period: Pick<AwayPeriod, "startsOn" | "endsOn">): string {
  return period.startsOn === period.endsOn
    ? shortDate(period.startsOn)
    : `${shortDate(period.startsOn)} to ${shortDate(period.endsOn)}`;
}

/** Everyone's away dates (note included), with a form to add your own. Admins can add for anyone. */
export function AwayCard({
  periods,
  viewerId,
  isAdmin,
  members,
  today,
  withForm = true,
}: {
  periods: AwayPeriod[];
  viewerId: string;
  isAdmin: boolean;
  members: { profileId: string; displayName: string }[];
  today: string;
  /** False on the rota page, where the dates are shown but set elsewhere. */
  withForm?: boolean;
}) {
  const [state, formAction, pending] = useActionState(setAway, initialState);

  if (!withForm && periods.length === 0) return null;

  return (
    <Card>
      <CardLabel>Away</CardLabel>
      <p className="text-muted mt-2 max-w-md">{AWAY_WORDING}</p>

      {periods.length > 0 ? (
        <ul className="mt-3 flex flex-col">
          {periods.map((period) => (
            <li
              key={period.id}
              className="border-line flex flex-wrap items-center gap-3 border-b py-3"
            >
              <p className="flex-1">
                {period.profileId === viewerId ? "You are" : `${period.name} is`} away{" "}
                {range(period)}
                {period.note ? <span className="text-muted">. {period.note}</span> : null}
              </p>
              {withForm && (period.profileId === viewerId || isAdmin) ? (
                <form action={endAway}>
                  <input type="hidden" name="awayId" value={period.id} />
                  <Button type="submit" variant="ghost">
                    End {period.profileId === viewerId ? "my" : `${period.name}’s`} away period
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {withForm ? (
        <form action={formAction} className="mt-4 flex flex-col gap-4">
          {isAdmin ? (
            <label className="flex flex-col gap-1">
              <span className="label-caps text-muted">Who</span>
              <select name="profile" defaultValue={viewerId} className={fieldClass}>
                {members.map((member) => (
                  <option key={member.profileId} value={member.profileId}>
                    {member.profileId === viewerId ? "Me" : member.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="label-caps text-muted">Away from</span>
              <input type="date" name="startsOn" min={today} required className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-caps text-muted">to</span>
              <input type="date" name="endsOn" min={today} required className={fieldClass} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label-caps text-muted">Note, optional</span>
            <input type="text" name="note" maxLength={100} className={fieldClass} />
          </label>
          {state.status === "error" ? (
            <p role="alert" className="text-negative">
              {state.message}
            </p>
          ) : null}
          {state.status === "saved" ? (
            <p role="status" className="text-muted">
              {state.message}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Mark as away"}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
