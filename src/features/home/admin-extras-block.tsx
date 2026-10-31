import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { getLiveInviteExpiry } from "@/features/household/live-invite";
import { getPendingRentPayments } from "@/features/recurring/rent";
import { currentWeekStart } from "@/features/rota/week";
import { getWeeks } from "@/features/rota/weeks";

import { buildAdminExtras, type AdminItem } from "./admin-extras";
import { HomeBlock } from "./home-block";

/** Reads only for owners and admins: a member's page never fetches any of this. */
async function loadAdminExtras(): Promise<AdminItem[]> {
  const membership = await getMembership();
  if (!membership) throw new Error("no flat");
  if (membership.role === "member") return [];

  const weekStart = currentWeekStart(new Date());
  const [payments, weeks, invite] = await Promise.all([
    getPendingRentPayments(),
    getWeeks([weekStart]),
    getLiveInviteExpiry(),
  ]);
  const week = weeks.find((w) => w.weekStart === weekStart);
  return buildAdminExtras({
    pendingRentPayments: payments.length,
    unassignedChores: (week?.assignments ?? [])
      .filter((a) => a.assigneeId === null)
      .map((a) => a.choreName),
    inviteOpen: invite !== null,
  });
}

export function AdminList({ items }: { items: AdminItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card aria-labelledby="home-admin">
      <CardLabel id="home-admin">For admins</CardLabel>
      <ul className="mt-3 flex flex-col">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="border-line flex min-h-11 items-center border-t py-3 underline-offset-4 first:border-t-0 hover:underline"
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Only rendered for owners and admins by the page. */
export function AdminExtras() {
  return (
    <HomeBlock name="admin" load={loadAdminExtras} height="min-h-16">
      {(items) => <AdminList items={items} />}
    </HomeBlock>
  );
}
