import type { HouseholdRole } from "./constants";

/** What a step needs to know to tell whether it is finished. Grows as modules arrive. */
export interface SetupContext {
  /** People currently in the flat. */
  memberCount: number;
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  href: string;
  done: (context: SetupContext) => boolean;
}

/**
 * The guided set-up, in the order an admin should do it. Each module adds its own step here when
 * it ships (rent and bills in `recurring`, chores and the rota in `rota`), so the checklist grows
 * without this module knowing about them.
 */
export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "invite-flatmates",
    title: "Invite your flatmates",
    description:
      "Share one link in your group chat. The rest of set-up works best once everyone is in.",
    href: "/more/flat",
    done: ({ memberCount }) => memberCount >= 2,
  },
];

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** The first step still to do. */
  current: boolean;
}

export type Checklist =
  { audience: "admin"; items: ChecklistItem[] } | { audience: "member" } | null;

/**
 * What Home shows about set-up. Owner and admins get the steps; plain members get a short note
 * until everything is done; once every step is done nobody sees anything.
 */
export function buildChecklist(
  role: HouseholdRole,
  context: SetupContext,
  steps: readonly SetupStep[] = SETUP_STEPS,
): Checklist {
  const evaluated = steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    href: step.href,
    done: step.done(context),
  }));
  if (evaluated.every((step) => step.done)) return null;

  if (role === "member") return { audience: "member" };

  const firstOpen = evaluated.findIndex((step) => !step.done);
  return {
    audience: "admin",
    items: evaluated.map((step, index) => ({ ...step, current: index === firstOpen })),
  };
}
