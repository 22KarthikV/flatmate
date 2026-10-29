import { Suspense } from "react";

import { RequireFlat } from "@/features/household/require-flat";
import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "Money | FlatMate" };

export default function MoneyPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <PlaceholderPage
          eyebrow="Rent, bills and expenses"
          title="Money"
          description="Who owes whom, rent due dates and shared bills."
          module="ledger and recurring"
        />
      </RequireFlat>
    </Suspense>
  );
}
