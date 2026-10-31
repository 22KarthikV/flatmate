import { cn } from "@/lib/cn";

import { castVote } from "./actions";
import type { EventView, OptionView } from "./event-model";
import { eventRange } from "./format";
import type { Answer } from "./majority";

const ANSWERS: { value: Answer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

function counts(option: OptionView): string {
  const { yes, maybe, no } = option.tally;
  return `${yes} yes, ${maybe} maybe, ${no} no`;
}

function AnswerButtons({ option, mine }: { option: OptionView; mine: Answer | undefined }) {
  const when = eventRange(option.startsAt, option.endsAt);
  return (
    <form
      action={castVote}
      role="group"
      aria-label={`Your answer for ${when}`}
      className="mt-3 flex gap-2"
    >
      <input type="hidden" name="optionId" value={option.id} />
      {ANSWERS.map((answer) => (
        <button
          key={answer.value}
          type="submit"
          name="answer"
          value={answer.value}
          aria-pressed={mine === answer.value}
          className={cn(
            "label-caps border-ink min-h-11 flex-1 border px-3 transition-colors duration-200",
            mine === answer.value ? "bg-ink text-paper" : "text-ink hover:bg-ink hover:text-paper",
          )}
        >
          {answer.label}
          {mine === answer.value ? " (your answer)" : ""}
        </button>
      ))}
    </form>
  );
}

/**
 * Every date with its counts, what it still needs and, while voting is open, the answer buttons.
 * Flatmates see each other's answers by name; the screen says so.
 */
export function VotePanel({ event }: { event: EventView }) {
  const open = event.status === "voting";
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {event.options.map((option) => (
          <li key={option.id} className="border-line border p-4">
            <p className="text-lg">
              {eventRange(option.startsAt, option.endsAt)}
              {option.confirmed ? <span className="label-caps ml-2">Chosen</span> : null}
            </p>
            <p className="text-muted mt-1 text-sm">{counts(option)}</p>
            {open ? <p className="mt-1 text-sm">{option.needs}</p> : null}
            {open ? <AnswerButtons option={option} mine={event.mine[option.id]} /> : null}
            {option.voters.length > 0 ? (
              <p className="text-muted mt-3 text-sm">
                {option.voters.map((voter) => `${voter.name}: ${voter.answer}`).join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {open ? (
        <p className="text-muted text-sm">
          {event.members === 1
            ? "You are the only one in the flat."
            : `${event.members} people are in the flat, so a date needs more than half of them to say yes.`}{" "}
          {event.waitingOn.length > 0
            ? `Not answered yet: ${event.waitingOn.join(", ")}.`
            : "Everyone has answered."}{" "}
          Your flatmates can see who answered what.
        </p>
      ) : null}
    </div>
  );
}
