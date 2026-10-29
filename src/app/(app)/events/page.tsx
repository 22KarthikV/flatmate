import { Suspense } from "react";

import { RequireFlat } from "@/features/household/require-flat";
import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "Events | FlatMate" };

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <PlaceholderPage
          eyebrow="Together"
          title="Events"
          description="Pick a day, everyone votes, the majority wins."
          module="events"
        />
      </RequireFlat>
    </Suspense>
  );
}
