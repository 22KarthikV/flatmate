"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { savePreferences } from "./actions";
import type { PreferenceView } from "./preferences";
import { NOTIFICATION_CATEGORIES, type SavePreferencesState } from "./types";

const IDLE: SavePreferencesState = { status: "idle" };

/**
 * Every choice on one page, grouped by what it is about, with a single Save at the bottom. Plain
 * checkboxes in a plain form, so it also works before any script has loaded. Push needs a device
 * that has turned it on; the choice is kept either way.
 */
export function PreferencesForm({ preferences }: { preferences: PreferenceView[] }) {
  const [state, action, pending] = useActionState(savePreferences, IDLE);

  const groups = NOTIFICATION_CATEGORIES.map((category) => ({
    category,
    rows: category.types.flatMap((type) => preferences.filter(({ info }) => info.type === type)),
  })).filter((group) => group.rows.length > 0);

  return (
    <form action={action} aria-label="What to tell me about" className="flex flex-col gap-6">
      {groups.map(({ category, rows }) => (
        <Card key={category.id} aria-labelledby={`category-${category.id}`}>
          <div className="flex items-baseline justify-between gap-4">
            <CardLabel id={`category-${category.id}`}>{category.label}</CardLabel>
            <p className="text-muted flex gap-5 text-xs" aria-hidden="true">
              <span className="w-12 text-center">In app</span>
              <span className="w-12 text-center">Push</span>
            </p>
          </div>
          <ul className="border-line mt-3 border-t">
            {rows.map(({ info, inApp, push }) => (
              <li
                key={info.type}
                className="border-line flex items-center justify-between gap-4 border-b py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{info.label}</p>
                  <p className="text-muted text-sm">{info.description}</p>
                </div>
                <div className="flex shrink-0 gap-5">
                  <label className="flex size-12 items-center justify-center">
                    <input
                      type="checkbox"
                      name={`in_app.${info.type}`}
                      defaultChecked={inApp}
                      aria-label={`In the app: ${info.label}`}
                      className="accent-ink size-5"
                    />
                  </label>
                  <label className="flex size-12 items-center justify-center">
                    <input
                      type="checkbox"
                      name={`push.${info.type}`}
                      defaultChecked={push}
                      aria-label={`Push to my phone: ${info.label}`}
                      className="accent-ink size-5"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <p className="text-muted text-sm">
        Everything you turn push off for still arrives in the app. Turning &ldquo;In app&rdquo; off
        stops that kind of notification altogether.
      </p>

      <div className="border-line bg-paper sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-4 border-t py-3 md:bottom-0">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <p role="status" className="text-sm">
          {state.status === "saved"
            ? state.changed === 0
              ? "Nothing to change."
              : "Saved."
            : null}
          {state.status === "error" ? state.message : null}
        </p>
      </div>
    </form>
  );
}
