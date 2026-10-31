import Link from "next/link";

export const metadata = { title: "More | FlatMate" };

const LINKS = [
  { href: "/more/shopping", label: "Shopping list" },
  { href: "/more/bins", label: "Bin days" },
  { href: "/more/board", label: "Noticeboard" },
  { href: "/more/fixes", label: "Fix-it log" },
  { href: "/more/meters", label: "Meter readings" },
  { href: "/more/flat", label: "Your flat" },
  { href: "/more/notifications", label: "Notifications" },
  { href: "/more/account", label: "Account" },
] as const;

export default function MorePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Everything else</p>
        <h1 className="font-display text-5xl sm:text-6xl">More</h1>
        <p className="text-muted max-w-md">
          Shopping list, bin days, noticeboard, fix-it log, meter readings and settings.
        </p>
      </header>
      <nav aria-label="More" className="flex flex-col gap-4">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="border-line flex min-h-14 items-center justify-between border px-6"
          >
            <span className="label-caps">{link.label}</span>
            <span aria-hidden className="text-muted">
              &rarr;
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
