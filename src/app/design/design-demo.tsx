"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { ToastMessage, ToastProvider } from "@/components/ui/toast";

const checklist = [
  "Clean the microwave",
  "Clean the gas stove",
  "Clean the sink",
  "Wipe the counters",
  "Put plates and cutlery away",
];

const balances = [
  { name: "Sam Patel", tone: 2 as const, amount: "+ £12.40", positive: true },
  { name: "Alex Moore", tone: 3 as const, amount: "+ £6.00", positive: true },
  { name: "Priya Nair", tone: 4 as const, amount: "− £4.20", positive: false },
];

export function DesignDemo() {
  const [toastOpen, setToastOpen] = useState(false);

  return (
    <ToastProvider>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-2">
          <p className="label-caps text-muted">Design system · dev only</p>
          <h1 className="font-display text-5xl sm:text-7xl">FlatMate</h1>
          <p className="text-muted max-w-md">
            Editorial minimalism. Serif display, quiet colour, hairline rules.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardLabel>This week · Sun 1 Nov</CardLabel>
            <h2 className="font-display mt-3 text-3xl">Kitchen</h2>
            <div className="mt-2 flex items-center gap-3">
              <Avatar name="Karthik V" tone={1} />
              <p className="text-muted">Assigned to you · due Sunday</p>
            </div>
            <div className="mt-6 flex flex-col">
              {checklist.map((item) => (
                <Checkbox key={item} label={item} />
              ))}
            </div>
            <Button className="mt-6 w-full">Mark chore done</Button>
          </Card>

          <Card>
            <CardLabel>Balances</CardLabel>
            <p className="font-display mt-3 text-6xl">£14.20</p>
            <p className="text-muted">You are owed overall</p>
            <ul className="divide-line border-line mt-6 divide-y border-y">
              {balances.map((b) => (
                <li key={b.name} className="flex min-h-14 items-center gap-3">
                  <Avatar name={b.name} tone={b.tone} />
                  <span className="flex-1">{b.name}</span>
                  <span className={b.positive ? "text-positive" : "text-negative"}>{b.amount}</span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" className="mt-6 w-full">
              Settle up
            </Button>
          </Card>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col gap-6">
            <CardLabel>Buttons</CardLabel>
            <div className="flex flex-wrap gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button disabled>Disabled</Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-6">
            <CardLabel>Form</CardLabel>
            <Input
              label="Amount"
              placeholder="£0.00"
              inputMode="decimal"
              hint="What did it cost?"
            />
            <Input label="Description" placeholder="Kitchen roll" />
          </Card>

          <Card className="flex flex-wrap items-center gap-3">
            <CardLabel className="w-full">Overlays</CardLabel>
            <Sheet
              trigger={<Button variant="secondary">Open sheet</Button>}
              title="Add expense"
              description="Split a cost with your flatmates."
            >
              <Input label="Amount" placeholder="£0.00" inputMode="decimal" />
            </Sheet>
            <Button variant="secondary" onClick={() => setToastOpen(true)}>
              Show toast
            </Button>
          </Card>

          <Card className="flex flex-col gap-4">
            <CardLabel>Flatmate tones</CardLabel>
            <div className="flex gap-3">
              {(["Karthik V", "Sam Patel", "Alex Moore", "Priya Nair", "Jo Lee"] as const).map(
                (name, i) => (
                  <Avatar key={name} name={name} tone={(i + 1) as 1 | 2 | 3 | 4 | 5} />
                ),
              )}
            </div>
          </Card>
        </section>

        <ToastMessage
          open={toastOpen}
          onOpenChange={setToastOpen}
          title="Expense added"
          description="Sam owes you £4.20."
        />
      </main>
    </ToastProvider>
  );
}
