import { Card, CardLabel } from "@/components/ui/card";

import { AssignmentCard } from "./assignment-card";
import { arrangeForViewer, weekHeading, type WeekView as WeekData } from "./week-model";

/** A week of the rota: the viewer's chores first with the reason, then everyone else's. */
export function WeekView({
  title,
  week,
  viewerId,
  today,
}: {
  title: string;
  week: WeekData;
  viewerId: string;
  today: string;
}) {
  const { mine, others, unassigned } = arrangeForViewer(week, viewerId);

  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <header>
        <h2 className="font-display text-3xl">{title}</h2>
        <p className="text-muted text-sm">{weekHeading(week.weekStart)}</p>
      </header>

      <Card>
        <CardLabel>Your chores</CardLabel>
        {mine.length > 0 ? (
          <ul className="mt-2 flex flex-col">
            {mine.map((a) => (
              <AssignmentCard key={a.id} assignment={a} today={today} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 max-w-md">
            Nothing for you this week. The rota keeps track, so you will get your turn.
          </p>
        )}
      </Card>

      {unassigned.length > 0 ? (
        <Card>
          <CardLabel>Nobody was around</CardLabel>
          <ul className="mt-2 flex flex-col">
            {unassigned.map((a) => (
              <AssignmentCard key={a.id} assignment={a} today={today} />
            ))}
          </ul>
        </Card>
      ) : null}

      {others.map((group) => (
        <Card key={group.personId}>
          <CardLabel>{group.name}</CardLabel>
          <ul className="mt-2 flex flex-col">
            {group.assignments.map((a) => (
              <AssignmentCard key={a.id} assignment={a} today={today} />
            ))}
          </ul>
        </Card>
      ))}
    </section>
  );
}
