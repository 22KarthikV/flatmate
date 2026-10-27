import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "Money | FlatMate" };

export default function MoneyPage() {
  return (
    <PlaceholderPage
      eyebrow="Rent, bills and expenses"
      title="Money"
      description="Who owes whom, rent due dates and shared bills."
      module="ledger and recurring"
    />
  );
}
