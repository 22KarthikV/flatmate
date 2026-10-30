import Link from "next/link";
import { Suspense } from "react";

import { RequireFlat } from "@/features/household/require-flat";
import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "Rota | FlatMate" };

export default function RotaPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <PlaceholderPage
          eyebrow="Chores"
          title="Rota"
          description="A fair weekly rotation, with checklists for every chore."
          module="rota"
        >
          <Link
            href="/rota/chores"
            className="label-caps inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Chores and checklists
          </Link>
          <Link
            href="/rota/availability"
            className="label-caps inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Which days are you around next week?
          </Link>
        </PlaceholderPage>
      </RequireFlat>
    </Suspense>
  );
}
