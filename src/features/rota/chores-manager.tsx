"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { archiveChore, loadDefaultChores } from "./actions";
import { ChoreForm } from "./chore-form";
import { MAX_ACTIVE_CHORES, describeCadence, type Chore } from "./constants";

/** The admin's list of chores, with add, edit, archive and the one-tap defaults for an empty flat. */
export function ChoresManager({ chores }: { chores: Chore[] }) {
  // The id of the chore being edited, "new" for the add form, or null.
  const [editing, setEditing] = useState<string | null>(null);
  const close = () => setEditing(null);

  return (
    <div className="flex flex-col gap-6">
      {chores.length === 0 ? (
        <Card>
          <CardLabel>No chores yet</CardLabel>
          <p className="mt-3 max-w-md">
            Start from a typical flat: Bins, Kitchen, Living room, Bathroom and Hallway, each with a
            checklist and an effort. You can change anything afterwards.
          </p>
          <form action={loadDefaultChores} className="mt-4">
            <Button type="submit">Load the usual five</Button>
          </form>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {chores.map((chore) => (
            <li key={chore.id}>
              <Card>
                {editing === chore.id ? (
                  <ChoreForm chore={chore} onDone={close} />
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-display text-2xl">{chore.name}</h2>
                      <p className="label-caps text-muted">Effort {chore.effort} of 5</p>
                    </div>
                    <p className="text-muted">
                      {describeCadence(chore)}
                      {chore.needsSignoff ? ", signed off by a flatmate" : ""}
                    </p>
                    {chore.items.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm">
                        {chore.items.map((item) => (
                          <li key={item.id}>{item.text}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <Button variant="secondary" onClick={() => setEditing(chore.id)}>
                        Edit {chore.name}
                      </Button>
                      <form action={archiveChore}>
                        <input type="hidden" name="choreId" value={chore.id} />
                        <Button type="submit" variant="ghost">
                          Archive {chore.name}
                        </Button>
                      </form>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing === "new" ? (
        <Card>
          <CardLabel>New chore</CardLabel>
          <div className="mt-4">
            <ChoreForm onDone={close} />
          </div>
        </Card>
      ) : chores.length < MAX_ACTIVE_CHORES ? (
        <div>
          <Button variant="secondary" onClick={() => setEditing("new")}>
            Add a chore
          </Button>
        </div>
      ) : (
        <p className="text-muted">
          A flat can have up to {MAX_ACTIVE_CHORES} chores. Archive one to add another.
        </p>
      )}
    </div>
  );
}
