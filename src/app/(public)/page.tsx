import Link from "next/link";

import { Reveal } from "@/components/fx/reveal";

const features = [
  {
    number: "01",
    title: "A rota that is fair",
    text: "Everyone takes every chore in turn. Tell us when you are away and the week rearranges itself, with a checklist for each job.",
  },
  {
    number: "02",
    title: "Rent and bills, on time",
    text: "Rent to the one who collects it, gas, electricity, Wi-Fi and council tax each month, with gentle reminders before the deadline.",
  },
  {
    number: "03",
    title: "Shared costs, settled",
    text: "Bought kitchen roll for the flat? Add it once. Everyone sees what they owe, and who owes whom.",
  },
  {
    number: "04",
    title: "Plans, by majority",
    text: "Propose an evening, everyone votes on the day, and the majority decides.",
  },
];

export default function Home() {
  return (
    <main>
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-10 pb-24 sm:px-8 sm:pt-24">
        <p className="label-caps animate-page-in text-muted">Co-living, composed</p>
        <h1 className="animate-page-in font-display text-6xl leading-[0.95] sm:text-8xl">
          FlatMate
        </h1>
        <p className="animate-page-in text-muted max-w-md text-lg">
          Shared flat life, sorted: rotas, rent, bills and plans in one place.
        </p>
        <div className="animate-page-in pt-2">
          <Link
            href="/dashboard"
            className="label-caps bg-ink text-paper inline-flex min-h-11 items-center px-6 hover:opacity-85"
          >
            Get started
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-8">
        {features.map((feature) => (
          <Reveal
            key={feature.number}
            className="border-line grid gap-3 border-t py-10 sm:grid-cols-[8rem_1fr_1.2fr] sm:gap-8"
          >
            <p className="font-display text-muted text-4xl">{feature.number}</p>
            <h2 className="font-display text-3xl sm:text-4xl">{feature.title}</h2>
            <p className="text-muted max-w-md">{feature.text}</p>
          </Reveal>
        ))}
      </section>
    </main>
  );
}
