import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "More | FlatMate" };

export default function MorePage() {
  return (
    <PlaceholderPage
      eyebrow="Everything else"
      title="More"
      description="Shopping list, meter readings, bin days, house notes and settings."
      module="extras"
    />
  );
}
