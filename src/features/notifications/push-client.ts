// Browser-side push: permission, subscribe, unsubscribe. Everything reads the browser through
// objects passed in or global lookups at call time, so tests can swap them for fakes.

export type PushState =
  | "checking"
  /** No service worker, push or notification support at all. */
  | "unsupported"
  /** iPhone/iPad in Safari: push only works from the installed Home Screen app (iOS 16.4+). */
  | "ios-browser"
  /** The server has no public VAPID key configured. */
  | "not-configured"
  /** The person blocked notifications for this site. */
  | "denied"
  /** Supported and allowed to ask: show "Turn on push". */
  | "ready"
  /** This device is subscribed and known to the server. */
  | "subscribed";

export interface PushEnv {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | undefined;
  ios: boolean;
  standalone: boolean;
}

/** Decides what to show. Pure: the same inputs always give the same state. */
export function getPushState(
  env: PushEnv,
  options: { configured: boolean; subscribed: boolean },
): Exclude<PushState, "checking"> {
  if (env.ios && !env.standalone) return "ios-browser";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (!options.configured) return "not-configured";
  if (env.permission === "denied") return "denied";
  return options.subscribed && env.permission === "granted" ? "subscribed" : "ready";
}

/** Reads the current browser. Call it in an effect, never during render. */
export function readPushEnv(): PushEnv {
  const nav = navigator;
  const ios =
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (nav as Navigator & { standalone?: boolean }).standalone === true;
  return {
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : undefined,
    ios,
    standalone,
  };
}

/** The key as bytes, the form `pushManager.subscribe` wants. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface SubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class PushError extends Error {
  constructor(
    readonly reason: "denied" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "PushError";
  }
}

/** How long to wait for the service worker before giving up (it is not registered in development). */
const READY_TIMEOUT_MS = 5000;

async function registration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("service worker not ready")), READY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Whether this browser already holds a push subscription for the app. */
export async function hasBrowserSubscription(): Promise<boolean> {
  try {
    return (await (await registration()).pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

/**
 * Asks for permission and subscribes this browser. Only ever call it from a tap: the permission
 * prompt must never appear on page load (SPEC-notifications N8).
 */
export async function subscribeToPush(publicKey: string): Promise<SubscriptionData> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushError("denied", "Notifications were not allowed.");
  }

  try {
    const subscription = await (
      await registration()
    ).pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) throw new Error("Incomplete subscription.");
    return { endpoint: json.endpoint, p256dh, auth };
  } catch (error) {
    if (error instanceof PushError) throw error;
    throw new PushError("failed", "This browser could not turn push on.");
  }
}

/** Removes this browser's subscription. Returns false when there was none to remove. */
export async function unsubscribeFromPush(): Promise<boolean> {
  const subscription = await (await registration()).pushManager.getSubscription();
  return subscription ? subscription.unsubscribe() : false;
}
