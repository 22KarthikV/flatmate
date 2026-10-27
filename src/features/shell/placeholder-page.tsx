import { Card, CardLabel } from "@/components/ui/card";

interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
  module: string;
}

/** Stand-in for a module that has not shipped yet. Replaced by the real screen. */
export function PlaceholderPage({ eyebrow, title, description, module }: PlaceholderPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">{eyebrow}</p>
        <h1 className="font-display text-5xl sm:text-6xl">{title}</h1>
        <p className="text-muted max-w-md">{description}</p>
      </header>
      <Card>
        <CardLabel>Coming soon</CardLabel>
        <p className="mt-3 text-lg">
          This screen arrives with the <code className="font-mono text-base">{module}</code> module.
        </p>
      </Card>
    </div>
  );
}
