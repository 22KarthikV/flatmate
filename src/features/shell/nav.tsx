"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { isActive, navItems, type NavItem } from "./nav-items";

const paths: Record<NavItem["icon"], string> = {
  home: "M3 11 12 4l9 7M5 10v10h14V10",
  rota: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M8.5 15l2.5 2.5 4.5-5",
  money:
    "M15 7.5c-.8-1.3-2.2-2-3.8-2C8.9 5.5 7.5 7 7.5 9c0 3.5 1.5 4.5 1.5 6.5 0 1.2-.7 2-2 2.5h10M6 12.5h8",
  events: "M12 3l2.4 5.6 6.1.5-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.5z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

function Icon({ name }: { name: NavItem["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth={name === "more" ? 2.5 : 1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="border-line bg-paper fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "label-caps flex min-h-14 flex-col items-center justify-center gap-1 text-[0.625rem]",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="border-line sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r px-6 py-8 md:flex"
    >
      <Link href="/dashboard" className="font-display text-3xl">
        FlatMate
      </Link>
      <ul className="mt-10 flex flex-col">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "label-caps border-line flex min-h-11 items-center gap-3 border-b",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
