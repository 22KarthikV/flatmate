import { ageText, type FixUpdate } from "./view";

/** The report's history in order. Notes show who wrote them; changes are plain sentences. */
export function FixTimeline({ updates, now }: { updates: FixUpdate[]; now: string }) {
  if (updates.length === 0) {
    return <p className="text-muted">No notes or changes yet.</p>;
  }
  return (
    <ol className="flex flex-col">
      {updates.map((update) => (
        <li key={update.id} className="border-line border-b py-3">
          <p className="break-words whitespace-pre-line">
            {update.kind === "note" ? `${update.authorName}: ${update.body}` : update.body}
          </p>
          <p className="text-muted text-sm">{ageText(update.createdAt, now)}</p>
        </li>
      ))}
    </ol>
  );
}
