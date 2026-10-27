"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import {
  dismissInstall,
  getInstallSnapshot,
  getServerInstallSnapshot,
  promptInstall,
  subscribeInstall,
} from "./install-store";

/** Invites people to add FlatMate to their Home Screen. Hidden once installed or dismissed. */
export function InstallPrompt() {
  const mode = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getServerInstallSnapshot);

  if (mode === "none" || mode === "installed") return null;

  return (
    <aside
      aria-label="Install FlatMate"
      className="border-line bg-surface mx-4 mt-4 flex flex-col gap-3 border p-4 sm:mx-8"
    >
      <p className="label-caps text-muted">Install the app</p>
      {mode === "ios" ? (
        <p>
          Tap the <strong>Share</strong> button in Safari, then choose{" "}
          <strong>Add to Home Screen</strong>. Reminders on iPhone only work once FlatMate is on
          your Home Screen.
        </p>
      ) : (
        <p>Add FlatMate to your home screen for quick access and reminders.</p>
      )}
      <div className="flex gap-3">
        {mode === "prompt" ? <Button onClick={() => void promptInstall()}>Install</Button> : null}
        <Button variant="ghost" onClick={dismissInstall}>
          Not now
        </Button>
      </div>
    </aside>
  );
}
