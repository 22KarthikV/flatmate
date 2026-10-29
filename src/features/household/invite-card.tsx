"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { createInvite, revokeInvite } from "./actions";
import type { CreateInviteState, SimpleState } from "./constants";

const initialInvite: CreateInviteState = { status: "idle" };
const initialRevoke: SimpleState = { status: "idle" };

/**
 * The flat's invite link. For safety the server keeps only a hash, so a link can be shown just
 * once, right after it is made. `activeUntil` says whether an earlier link is still working.
 */
export function InviteCard({ activeUntil }: { activeUntil: string | null }) {
  const [invite, createAction, creating] = useActionState(createInvite, initialInvite);
  const [revoked, revokeAction, revoking] = useActionState(revokeInvite, initialRevoke);
  const [copied, setCopied] = useState(false);
  // Switching the link off hides it at once; a newly made link has a new address, so it shows again.
  const [dismissed, setDismissed] = useState<string | null>(null);

  const created = invite.status === "created" && invite.url !== dismissed ? invite.url : null;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const hasLink = created !== null || (activeUntil !== null && dismissed === null);

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (!created) return;
    try {
      await navigator.share({ title: "Join our flat on FlatMate", url: created });
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  return (
    <Card>
      <CardLabel>Invite flatmates</CardLabel>
      <p className="text-muted mt-3 max-w-md text-sm">
        Share one link in your flat&rsquo;s group chat. Anyone who opens it can sign in with Google
        and join. It works for several people and expires after 7 days.
      </p>

      {created ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="label-caps text-muted" htmlFor="invite-url">
            Your link
          </label>
          <input
            id="invite-url"
            readOnly
            value={created}
            onFocus={(event) => event.currentTarget.select()}
            className="border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={copy}>
              Copy link
            </Button>
            {canShare ? (
              <Button type="button" variant="secondary" onClick={share}>
                Share
              </Button>
            ) : null}
            {copied ? (
              <p role="status" className="text-positive text-sm">
                Copied.
              </p>
            ) : null}
          </div>
          <p className="text-muted text-sm">
            For safety this link is shown only now. You can make a new one at any time.
          </p>
        </div>
      ) : activeUntil && dismissed === null ? (
        <p className="mt-4 text-sm">
          A link is working until {activeUntil}. For safety it can&rsquo;t be shown again; make a
          new link to share it.
        </p>
      ) : (
        <p className="mt-4 text-sm">There is no working link right now.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={createAction}>
          <Button type="submit" variant={hasLink ? "secondary" : "primary"} disabled={creating}>
            {creating ? "Making" : hasLink ? "Make a new link" : "Make a link"}
          </Button>
        </form>
        {hasLink ? (
          <form
            action={revokeAction}
            onSubmit={() => setDismissed(invite.status === "created" ? invite.url : "revoked")}
          >
            <Button type="submit" variant="ghost" disabled={revoking}>
              Switch link off
            </Button>
          </form>
        ) : null}
      </div>

      {invite.status === "error" ? (
        <p role="alert" className="text-negative mt-3 text-sm">
          {invite.message}
        </p>
      ) : null}
      {revoked.status === "error" ? (
        <p role="alert" className="text-negative mt-3 text-sm">
          {revoked.message}
        </p>
      ) : null}
    </Card>
  );
}
