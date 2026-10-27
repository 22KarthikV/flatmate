import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "Home | FlatMate" };

export default function DashboardPage() {
  return (
    <PlaceholderPage
      eyebrow="Today"
      title="Home"
      description="Your chores, what you owe and what's coming up, in one place."
      module="household"
    />
  );
}
