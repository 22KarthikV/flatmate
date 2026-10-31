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
          <li>
            the flat&rsquo;s name and time zone, its rota answer deadline, and when it was created
            or closed;
          </li>
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

      <Section title="What we store about your notifications">
        <p>
          When something happens in your flat (someone joins or leaves, or your role changes),
          FlatMate can tell you. It stores:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            each <strong>notification</strong> sent to you: a title, a short line, the screen it
            opens, when it arrived, and whether you have read or snoozed it. Only you can see your
            own; not even your flatmates can. Unread ones are kept, and read ones are deleted after
            90 days;
          </li>
          <li>
            your <strong>choices</strong>: for each kind of notification, whether you want it in the
            app and as a push;
          </li>
          <li>
            for each device where you turn on push, a <strong>push address</strong> and two
            encryption keys. These come from your browser&rsquo;s push service and are what lets
            FlatMate send to that device and no other. We also keep a rough label such as
            &ldquo;Safari on iPhone&rdquo;, when it was added, and when a push last worked or
            failed;
          </li>
          <li>
            a short-lived <strong>delivery record</strong> of each push that was queued or sent,
            deleted after 14 days.
          </li>
        </ul>
        <p>
          A push carries only a title, one short line and a link, never amounts or other private
          detail. It travels through the push service your browser uses, run by Apple, Google,
          Microsoft or Mozilla, which can see that a message was sent to your device but not what it
          says. Push is always your choice: your browser asks first, and you can turn push off for
          one device on the notification settings page without affecting your others.
        </p>
      </Section>

      <Section title="What we store about shared money">
        <p>
          When you or a flatmate add a shared expense, or record a payment between flatmates,
          FlatMate stores:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            each <strong>expense</strong>: the amount, what it was for, a category, its date, who
            paid, who added it and when;
          </li>
          <li>
            each person&rsquo;s <strong>share</strong> of it, so the app can work out who owes whom;
          </li>
          <li>
            each <strong>payment</strong> between two flatmates, and whether the person receiving it
            confirmed it.
          </li>
        </ul>
        <p>
          Everyone in your flat can see these, and nobody outside it can. FlatMate only keeps a
          record: it never touches money and never asks for card or bank details. Nothing here is
          ever overwritten or deleted. Correcting or cancelling an expense keeps the earlier version
          in its history, so everyone can see what changed. Amounts appear in the app and in your
          inbox, but never in a push to your phone.
        </p>
      </Section>

      <Section title="What we store about rent and bills">
        <p>
          When an admin sets up the rent or a monthly bill such as gas, electricity, Wi-Fi or
          council tax, FlatMate stores:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            the <strong>template</strong>: its name, who collects or pays it, the day it is due, the
            months it applies to, and whether it is paused or ended;
          </li>
          <li>
            for rent, the <strong>rooms</strong> with their rent and who lives in each, and each
            person&rsquo;s amount; for a bill, who shares it;
          </li>
          <li>
            each <strong>month</strong> that was created, and for rent each person&rsquo;s{" "}
            <strong>charge</strong> and each <strong>rent payment</strong> they record, with whether
            the collector confirmed it;
          </li>
          <li>a short log of who changed a template and when.</li>
        </ul>
        <p>
          Bills are shared money, so a bill each month appears as an ordinary expense that everyone
          in your flat can see. Rent is private: you can see only your own rent and payments, and
          nobody else in the flat can see what you pay. The person who collects the rent and the
          flat&rsquo;s owner and admins can see everyone&rsquo;s, so they can run it. Nothing here
          is overwritten or deleted once created. If you leave, your past rent rows stay for the
          admins as history; if you delete your account, your name on them becomes &ldquo;Deleted
          user&rdquo;. Amounts appear in the app and in your inbox, but never in a push to your
          phone.
        </p>
      </Section>

      <Section title="What we store about the chore rota">
        <p>When your flat uses the rota, FlatMate stores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            your <strong>availability</strong>: for each day of the coming week, whether you said
            you are around, when you last changed it, and whether the app filled it in as around
            because you did not answer by the deadline;
          </li>
          <li>
            each <strong>chore given to you</strong>: which chore, the day, why it was yours, which
            steps you ticked and when, whether it was finished, reopened or signed off, and who
            reopened or signed it off;
          </li>
          <li>
            <strong>swap requests</strong> between flatmates (who asked whom, for which chore,
            whether it was accepted, declined or withdrawn, and when), and the name of the admin who
            moved a chore directly;
          </li>
          <li>
            the <strong>dates you are away</strong> from chores, with the short note you add if you
            wish, which everyone in your flat can read. Away dates never affect rent or bills;
          </li>
          <li>
            a record of the <strong>chores moved when a flatmate left</strong> (which chore, who it
            came from and who it went to, and who undid it), kept so an admin can undo it within 24
            hours;
          </li>
          <li>
            a note of when you last had each chore and whether you were passed over for it, which is
            how the rota keeps turns fair;
          </li>
          <li>
            the flat&rsquo;s chores and checklists, which are about the flat and not about you.
          </li>
        </ul>
        <p>
          Everyone in your flat can see everyone&rsquo;s availability, because the rota depends on
          it, and nobody outside it can. Reminders about the rota appear in your inbox and never
          carry a chore or a person in a push to your phone. If you delete your account your name is
          replaced with &ldquo;Deleted user&rdquo; and past availability stays with the flat&rsquo;s
          history.
        </p>
      </Section>

      <Section title="What we store about events">
        <p>When your flat plans an event, FlatMate stores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            the <strong>events you propose</strong>: the title, description and place you write, the
            dates offered, when voting closes, and who organised it;
          </li>
          <li>
            your <strong>yes, maybe or no answers</strong> on each date, when you gave them and
            changed them. Your flatmates can see which answer you gave, by name, so they know who
            has not answered yet;
          </li>
          <li>
            which date was confirmed and how, and, if an event is cancelled, who cancelled it and
            the short reason they gave.
          </li>
        </ul>
        <p>
          Only your flat can see its events, and nobody outside it can. Reminders about events
          appear in your inbox and never carry an event title, place or person in a push to your
          phone. If you leave the flat or delete your account, your answers stay as part of the
          flat&rsquo;s history, shown as &ldquo;Deleted user&rdquo; if the account is gone, but they
          stop counting towards any vote.
        </p>
      </Section>

      <Section title="What we store about the shopping list">
        <p>
          When your flat uses the shopping list, FlatMate stores the{" "}
          <strong>item names and notes</strong> you type, who added each one and who bought it,
          when, and a link to any expense made from them. Everyone in your flat can see the list,
          and nobody outside it can. Unbought items you added are deleted if you delete your
          account. Items are removed 90 days after they are cleared.
        </p>
      </Section>

      <Section title="What we store about bin days">
        <p>
          When your flat sets up bin days, FlatMate stores the{" "}
          <strong>names, colours and repeat pattern of your flat&rsquo;s bins</strong>, one real
          collection date to count from, and any skipped or moved collections an admin adds, with
          who added them. Everyone in your flat can see them, and nobody outside it can. A reminder
          appears in your inbox the evening before a collection; it can be turned off. A push to
          your phone only says that a bin collection is tomorrow. FlatMate does not look anything up
          from your council.
        </p>
      </Section>

      <Section title="What we store about the noticeboard">
        <p>
          When your flat uses the noticeboard, FlatMate stores the{" "}
          <strong>short posts your flatmates write</strong>, who posted them, when, and when they
          expire. Everyone in your flat can see them, and nobody outside it can. Posts you wrote are
          deleted if you delete your account; others disappear when they expire. A new post appears
          in your inbox without its words, and a push to your phone never carries them.
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
          <li>
            <strong>Your browser&rsquo;s push service</strong> (Apple, Google, Microsoft or Mozilla)
            delivers push notifications, only if you turn them on.
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
          signed out everywhere. Your notifications, notification choices and push devices are
          deleted at the same moment, so nothing can be sent to your phone afterwards. Messages
          other people already received about you will say &ldquo;Deleted user&rdquo; instead of
          your name. Your place in your flat ends. If you owned a flat with no one else in it, that
          flat is closed. Records you added to a flat (for example an expense) may remain for your
          flatmates&rsquo; history without your name. A closed flat&rsquo;s records are kept but
          nobody can open it. Technical logs are kept by our providers for a short time and then
          removed.
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
