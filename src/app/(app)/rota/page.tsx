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
        />
      </RequireFlat>
    </Suspense>
  );
}
