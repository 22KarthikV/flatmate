import { renderIcon } from "@/features/pwa/icon-image";

export function GET() {
  return renderIcon(512, { maskable: true });
}
