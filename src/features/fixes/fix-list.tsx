import Link from "next/link";

import { ageText, chasingText, groupReports, statusLabel, type FixReport } from "./view";

function Row({ report, now }: { report: FixReport; now: string }) {
  return (
    <li className="border-line border-b">
      <Link href={`/more/fixes/${report.id}`} className="flex min-h-14 flex-col gap-1 py-3">
        <span className="break-words">{report.title}</span>
        <span className="text-muted text-sm break-words">
          {statusLabel(report.status)}
          {report.location ? ` · ${report.location}` : ""} · {chasingText(report)} ·{" "}
          {ageText(report.createdAt, now)}
        </span>
      </Link>
    </li>
  );
}

function Group({
  id,
  title,
  reports,
  now,
}: {
  id: string;
  title: string;
  reports: FixReport[];
  now: string;
}) {
  if (reports.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="label-caps text-muted">
        {title} ({reports.length})
      </h2>
      <ul>
        {reports.map((report) => (
          <Row key={report.id} report={report} now={now} />
        ))}
      </ul>
    </section>
  );
}

/** Open first, then in progress, then fixed (collapsed). Status is always a word. */
export function FixList({ reports, now }: { reports: FixReport[]; now: string }) {
  if (reports.length === 0) {
    return <p className="text-muted">Nothing is broken. Report a problem when something is.</p>;
  }
  const groups = groupReports(reports);
  return (
    <div className="flex flex-col gap-8">
      <Group id="open" title="Open" reports={groups.open} now={now} />
      <Group id="in-progress" title="In progress" reports={groups.inProgress} now={now} />
      {groups.fixed.length > 0 ? (
        <details>
          <summary className="label-caps text-muted inline-flex min-h-11 cursor-pointer items-center">
            Fixed ({groups.fixed.length})
          </summary>
          <ul>
            {groups.fixed.map((report) => (
              <Row key={report.id} report={report} now={now} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
