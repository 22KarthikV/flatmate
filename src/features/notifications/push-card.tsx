"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { removePushSubscription, savePushSubscription } from "./actions";
import {
  PushError,
  getPushState,
  hasBrowserSubscription,
  readPushEnv,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "./push-client";
import type { PushDevice } from "./push-devices";

/** Which row in the device list is this browser. Kept here because the server never sees endpoints. */
const DEVICE_KEY = "flatmate.push-device-id";

function readDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

function writeDeviceId(id: string | null) {
  try {
    if (id) localStorage.setItem(DEVICE_KEY, id);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Private browsing: the list still works, it just cannot mark this device.
  }
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const EXPLANATIONS: Partial<Record<PushState, string>> = {
  unsupported:
    "This browser can’t receive push notifications. Everything still arrives in the app, in your inbox.",
  "ios-browser":
    "On iPhone and iPad, push works from the Home Screen app (iOS 16.4 or later). In Safari, tap Share, then Add to Home Screen, open FlatMate from there, and come back to this page.",
  "not-configured": "Push isn’t set up on this server yet. Everything still arrives in your inbox.",
  denied:
    "Notifications are blocked for FlatMate in this browser. Allow them in the browser’s site settings, then reload this page.",
};

interface PushCardProps {
  /** The public VAPID key, or null when the server has none. */
  publicKey: string | null;
  devices: PushDevice[];
}

/**
 * Turn push on or off for this device, and see or remove every device. The permission prompt only
 * ever appears after the person taps "Turn on push" (SPEC-notifications N8).
 */
export function PushCard({ publicKey, devices }: PushCardProps) {
  const [state, setState] = useState<PushState>("checking");
  const [thisDevice, setThisDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const deviceIds = devices.map((device) => device.id).join(",");

  const refreshState = useCallback(async () => {
    const stored = readDeviceId();
    const known = stored !== null && deviceIds.split(",").includes(stored);
    const subscribed = known && (await hasBrowserSubscription());
    setThisDevice(known ? stored : null);
    setState(getPushState(readPushEnv(), { configured: publicKey !== null, subscribed }));
  }, [deviceIds, publicKey]);

  useEffect(() => {
    // Reads the browser (not available on the server), so it can only run after the page loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshState();
  }, [refreshState]);

  const turnOn = () => {
    if (!publicKey) return;
    setError(null);
    startTransition(async () => {
      try {
        const subscription = await subscribeToPush(publicKey);
        const result = await savePushSubscription(subscription);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        writeDeviceId(result.id);
      } catch (caught) {
        if (caught instanceof PushError && caught.reason === "denied") {
          setError("Notifications weren’t allowed, so push stays off.");
        } else {
          setError("This browser couldn’t turn push on. The inbox still works.");
        }
      }
      await refreshState();
    });
  };

  const removeDevice = (device: PushDevice) => {
    setError(null);
    startTransition(async () => {
      const result = await removePushSubscription(device.id);
      if (!result.ok) {
        setError("That device couldn’t be removed. Try again.");
        return;
      }
      if (device.id === readDeviceId()) {
        await unsubscribeFromPush().catch(() => false);
        writeDeviceId(null);
      }
      await refreshState();
    });
  };

  const thisDeviceRecord = devices.find((device) => device.id === thisDevice);

  return (
    <Card>
      <CardLabel>Push on this device</CardLabel>

      {state === "checking" ? (
        <p className="text-muted mt-3 text-sm">Checking this device…</p>
      ) : null}

      {EXPLANATIONS[state] ? <p className="mt-3 max-w-prose">{EXPLANATIONS[state]}</p> : null}

      {state === "ready" ? (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="max-w-prose">
            Get a phone notification for the things you’ve chosen below, even when the app is
            closed. Your browser will ask for permission when you tap.
          </p>
          <Button onClick={turnOn} disabled={pending}>
            Turn on push on this device
          </Button>
        </div>
      ) : null}

      {state === "subscribed" && thisDeviceRecord ? (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p>Push is on for this device.</p>
          <Button
            variant="secondary"
            onClick={() => removeDevice(thisDeviceRecord)}
            disabled={pending}
          >
            Turn off push on this device
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-negative mt-3 text-sm">
          {error}
        </p>
      ) : null}

      {devices.length > 0 ? (
        <div className="mt-6">
          <CardLabel>Your devices</CardLabel>
          <ul className="border-line mt-3 border-t">
            {devices.map((device) => (
              <li
                key={device.id}
                className="border-line flex min-h-14 items-center justify-between gap-3 border-b py-2"
              >
                <span className="min-w-0">
                  <span className="block">
                    {device.label}
                    {device.id === thisDevice ? (
                      <span className="label-caps text-muted ml-2 text-[0.625rem]">
                        This device
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted block text-sm">
                    Added {dateFormat.format(new Date(device.createdAt))}
                    {device.failedAt ? " · not reachable at the moment" : ""}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => removeDevice(device)}
                  disabled={pending}
                  aria-label={`Remove ${device.label}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
