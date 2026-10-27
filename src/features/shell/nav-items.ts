export interface NavItem {
  href: string;
  label: string;
  icon: "home" | "rota" | "money" | "events" | "more";
}

/** Signed-in navigation. Each entry maps to one or more capability-map modules. */
export const navItems: readonly NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/rota", label: "Rota", icon: "rota" },
  { href: "/money", label: "Money", icon: "money" },
  { href: "/events", label: "Events", icon: "events" },
  { href: "/more", label: "More", icon: "more" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
