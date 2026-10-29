import Link from "next/link";

import { ContactLine, LegalPage, Section } from "@/features/legal/legal-page";

export const metadata = {
  title: "Privacy | FlatMate",
  description: "What FlatMate stores about you, why, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="What we keep, and why"
      intro="FlatMate keeps as little about you as it can. This page lists everything it stores today, who helps run it, and how to remove it."
    >
      <Section title="Who is responsible">
        <p>
          FlatMate is run by an individual in the United Kingdom, who decides what is collected and
          why. In data protection terms that person is the &ldquo;controller&rdquo;. To reach them,{" "}
          <ContactLine />.
        </p>
      </Section>

      <Section title="What we store about you">
        <p>When you sign in with Google, FlatMate receives and stores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your email address;</li>
          <li>your name and profile photo address from your Google account;</li>
          <li>a Google account identifier, so we know it is you next time;</li>
          <li>when you signed up and last signed in.</li>
        </ul>
        <p>
          From that FlatMate makes your <strong>profile</strong>: a display name (the name your
          flatmates see, which you can change) and your photo address. Your photo is refreshed from
          Google when you sign in. We never see or store a password, because Google handles the
          sign-in.
        </p>
        <p>
          As FlatMate gains more features (rotas, rent, bills, expenses and events), what you add to
          them will be stored too. This page will be updated, and shown to you, before any new kind
          of data is collected.
        </p>
      </Section>

      <Section title="What we store about your flat">
        <p>When you create or join a flat, FlatMate also stores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>the flat&rsquo;s name and time zone, and when it was created or closed;</li>
          <li>
            your <strong>membership</strong>: which flat you are in, your role (owner, admin or
            member), when you joined, and when and why you left (you left, you were removed, your
            account was deleted, or the flat was closed);
          </li>
          <li>
            the flat&rsquo;s <strong>invite link</strong>: who made it, when it was made and when it
            expires or was switched off. Only a scrambled fingerprint of the link is kept, never the
            link itself.
          </li>
        </ul>
        <p>
          The other people in your flat can see your display name, photo and role. If you leave, or
          are removed, they still see your name next to things you added, so the flat&rsquo;s
          history makes sense. People in other flats cannot see anything about you.
        </p>
      </Section>

      <Section title="Why we use it">
        <p>
          Only to run the service you asked for: signing you in, showing your flatmates who you are,
          and keeping your flat&rsquo;s information together. Our legal basis is that this is needed
          to provide FlatMate to you (a contract). We do not sell your data, show adverts, or use it
          to profile you.
        </p>
      </Section>

      <Section title="Cookies and storage on your device">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Sign-in cookies</strong> keep you signed in (essential). A short-lived cookie
            also protects the sign-in handshake with Google.
          </li>
          <li>
            <strong>Offline files.</strong> The installed app saves its own pages and images on your
            device so it can open without a connection.
          </li>
          <li>
            <strong>One preference</strong> remembers that you dismissed the &ldquo;install the
            app&rdquo; reminder.
          </li>
        </ul>
        <p>
          There are no advertising, analytics or tracking cookies, so there is no cookie banner to
          click.
        </p>
      </Section>

      <Section title="Who helps us run FlatMate">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> stores the database and runs sign-in. Our project is hosted in
            London (the UK).
          </li>
          <li>
            <strong>Vercel</strong> hosts the app and may keep technical request logs (such as your
            IP address and the time) for security and fixing faults. Its servers may be outside the
            UK.
          </li>
          <li>
            <strong>Google</strong> signs you in. Their handling of your Google account is covered
            by Google&rsquo;s own privacy policy.
          </li>
        </ul>
        <p>
          These providers act on our instructions, and where data leaves the UK they rely on
          recognised safeguards such as standard contractual clauses.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          For as long as you have an account. When you delete your account, your sign-in record is
          removed, your name and photo are replaced by &ldquo;Deleted user&rdquo;, and you are
          signed out everywhere. Your place in your flat ends. If you owned a flat with no one else
          in it, that flat is closed. Records you added to a flat (for example an expense) may
          remain for your flatmates&rsquo; history without your name. A closed flat&rsquo;s records
          are kept but nobody can open it. Technical logs are kept by our providers for a short time
          and then removed.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask to see, correct, export or erase your data, to restrict or object to how it is
          used, and to complain to the Information Commissioner&rsquo;s Office (ico.org.uk).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Change your name:</strong> Account page, Display name.
          </li>
          <li>
            <strong>Delete your account:</strong> Account page, Delete account. It takes effect
            straight away. If you own a flat other people live in, hand it over first.
          </li>
          <li>
            <strong>Leave a flat:</strong> More, then Your flat.
          </li>
          <li>
            <strong>Get a copy of your data, or anything else:</strong> <ContactLine />. We aim to
            reply within one month.
          </li>
        </ul>
      </Section>

      <Section title="Changes to this page">
        <p>
          If this page changes in a way that matters, we will say so in the app. See also the{" "}
          <Link href="/terms" className="underline underline-offset-4">
            terms of use
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
