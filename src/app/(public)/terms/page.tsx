import Link from "next/link";

import { ContactLine, LegalPage, Section } from "@/features/legal/legal-page";

export const metadata = {
  title: "Terms | FlatMate",
  description: "The plain-English rules for using FlatMate.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms of use"
      title="The ground rules"
      intro="FlatMate is a free tool for people who share a home. By signing in you agree to these terms. They are written to be read."
    >
      <Section title="What FlatMate is">
        <p>
          FlatMate helps flatmates organise chores, rent, bills, shared costs and plans. It keeps
          track of who owes what, but it does <strong>not</strong> move money, hold money or give
          financial advice. Any payment happens between you and your flatmates, outside the app.
        </p>
      </Section>

      <Section title="Your account">
        <ul className="list-disc space-y-1 pl-5">
          <li>You sign in with your own Google account and keep your sign-in secure.</li>
          <li>You are responsible for what you do with your account.</li>
          <li>You can delete your account at any time from the Account page.</li>
        </ul>
      </Section>

      <Section title="What you add, and who sees it">
        <p>
          What you add to a flat (such as expenses, availability and event votes) is visible to the
          other members of that flat, along with your display name and photo. Only add things you
          are happy for your flatmates to see, and keep the amounts and details accurate.
        </p>
      </Section>

      <Section title="Using it properly">
        <p>Please do not:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>use FlatMate to harass anyone, or to break the law;</li>
          <li>
            try to get into other people&rsquo;s accounts or flats, or to break or overload the
            service;
          </li>
          <li>copy, resell or run a competing service from FlatMate&rsquo;s code or content.</li>
        </ul>
        <p>We may suspend an account that does, and we will tell you why where we can.</p>
      </Section>

      <Section title="No guarantees">
        <p>
          FlatMate is provided free and &ldquo;as it is&rdquo;. We work hard to keep it running and
          correct, but it may have faults or be unavailable, and features may change. Please check
          important dates and amounts yourself.
        </p>
        <p>
          To the extent the law allows, we are not liable for losses that come from using, or being
          unable to use, FlatMate. Nothing in these terms limits liability that cannot lawfully be
          limited, such as for death or personal injury caused by negligence, or for fraud, and
          nothing here affects your statutory rights.
        </p>
      </Section>

      <Section title="Changes, and the law">
        <p>
          We may update these terms; if the change matters we will tell you in the app, and carrying
          on using FlatMate means you accept it. These terms are governed by the law of Scotland,
          and the Scottish courts can settle disputes, unless the law where you live says otherwise.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          To reach us, <ContactLine />. How we handle your information is in the{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy notice
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
