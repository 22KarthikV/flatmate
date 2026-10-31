import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { getChores } from "@/features/rota/chores";
import { getMembership } from "@/features/household/membership";
import { currentWeekStart, londonDate } from "@/features/rota/week";
import { getWeeks } from "@/features/rota/weeks";

import { myChores, type MyChores } from "./chores";
import { HomeBlock } from "./home-block";

const rowClass =
  "border-line flex min-h-11 flex-col justify-center border-t py-3 underline-offset-4 first:border-t-0 hover:underline";

async function loadChores(): Promise<MyChores | null> {
  const membership = await getMembership();
  if (!membership) return null;
  const now = new Date();
  const weekStart = currentWeekStart(now);
  const weeks = await getWeeks([weekStart]);
  const week = weeks.find((w) => w.weekStart === weekStart) ?? null;
  if (!week && (await getChores()).length === 0) {
    // No chores at all: admins are pointed at the manager, members see nothing.
    const isAdmin = membership.role === "owner" || membership.role === "admin";
    return { kind: isAdmin ? "add_chores" : "hidden" };
  }
  return myChores(week, membership.profileId, londonDate(now));
}

export function ChoresList({ chores }: { chores: MyChores }) {
  if (chores.kind === "not_ready") {
    return <p className="text-sm">The rota for this week isn&rsquo;t ready yet.</p>;
  }
  if (chores.kind === "add_chores") {
    return (
      <Link href="/rota/chores" className={rowClass}>
        Add your chores
      </Link>
    );
  }
  if (chores.kind === "hidden") return null;
  const { rows, doneCount } = chores;
  return (
    <>
      {rows.length === 0 && doneCount === 0 ? (
        <p className="text-sm">No chores for you this week.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={row.href} className={rowClass}>
                <span>{row.name}</span>
                <span className="text-muted text-sm">
                  {row.statusText} &middot; {row.day}
                  {row.progress ? ` · ${row.progress}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {doneCount > 0 ? <p className="text-muted mt-2 text-sm">{doneCount} done</p> : null}
    </>
  );
}

/** The signed-in person's own chores this week. The full rota is one tap away. */
export function MyChoresBlock() {
  return (
    <HomeBlock name="chores" load={loadChores}>
      {(chores) =>
        chores.kind === "hidden" ? null : (
          <Card aria-labelledby="home-chores">
            <CardLabel id="home-chores">Your chores this week</CardLabel>
            <div className="mt-3">
              <ChoresList chores={chores} />
            </div>
            <Link
              href="/rota"
              className="label-caps text-muted mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
            >
              See the full rota
            </Link>
          </Card>
        )
      }
    </HomeBlock>
  );
}
