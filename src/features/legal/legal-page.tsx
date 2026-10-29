import type { ReactNode } from "react";

import { LAST_UPDATED, resolveContact } from "./contact";

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-10 pb-24 sm:px-8 sm:pt-20">
      <header className="flex flex-col gap-4">
        <p className="label-caps animate-page-in text-muted">{eyebrow}</p>
        <h1 className="animate-page-in font-display text-5xl leading-[0.95] sm:text-7xl">
          {title}
        </h1>
        <p className="animate-page-in text-muted max-w-xl text-lg">{intro}</p>
        <p className="label-caps text-muted">Last updated {LAST_UPDATED}</p>
      </header>
      <div className="flex flex-col gap-10">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line flex flex-col gap-3 border-t pt-6">
      <h2 className="font-display text-3xl">{title}</h2>
      <div className="flex max-w-prose flex-col gap-3 leading-relaxed">{children}</div>
    </section>
  );
}

/** Reads the configured contact at render time, so changing the setting needs no code change. */
export function ContactLine() {
  const contact = resolveContact(process.env.NEXT_PUBLIC_CONTACT_EMAIL);
  if (contact.kind === "email") {
    return (
      <a className="underline underline-offset-4" href={`mailto:${contact.email}`}>
        {contact.email}
      </a>
    );
  }
  return (
    <>
      open an issue at{" "}
      <a className="underline underline-offset-4" href={contact.url}>
        {contact.url.replace("https://", "")}
      </a>{" "}
      (please do not put personal details in a public issue; say you would like a private reply)
    </>
  );
}
