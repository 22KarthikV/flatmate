import { notFound } from "next/navigation";

import { DesignDemo } from "./design-demo";

export const metadata = { title: "Design | FlatMate", robots: { index: false } };

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignDemo />;
}
