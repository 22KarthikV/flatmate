import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";

import type { Checklist } from "./setup-steps";

/** Home's set-up guide. Renders nothing when there is nothing left to do. */
export function SetupChecklist({ checklist }: { checklist: Checklist }) {
  if (!checklist) return null;

  if (checklist.audience === "member") {
    return (
      <Card>
        <CardLabel>Setting up</CardLabel>
        <p className="mt-3 max-w-md text-sm">
          Your admin is still setting the flat up. Chores, rent and bills will appear here as they
          finish.
        </p>
      </Card>
    );
  }

  return (
    <Card aria-labelledby="setup-title">
      <CardLabel id="setup-title">Set up your flat</CardLabel>
      <ol className="mt-4 flex flex-col">
        {checklist.items.map((item, index) => (
          <li
            key={item.id}
            aria-current={item.current ? "step" : undefined}
            className="border-line flex items-start gap-4 border-t py-4 first:border-t-0 first:pt-0"
          >
            <span
              aria-hidden
              className={
                item.done
                  ? "bg-ink text-paper flex size-7 shrink-0 items-center justify-center rounded-full text-sm"
                  : "border-ink flex size-7 shrink-0 items-center justify-center rounded-full border text-sm"
              }
            >
              {item.done ? "✓" : index + 1}
            </span>
            <div className="min-w-0">
              <p className={item.done ? "text-muted text-lg line-through" : "text-lg"}>
                {item.title}
                <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
              </p>
              {item.done ? null : (
                <>
                  <p className="text-muted mt-1 max-w-md text-sm">{item.description}</p>
                  <Link
                    href={item.href}
                    className="label-caps mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
                  >
                    {item.current ? "Do this now" : "Open"}
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
