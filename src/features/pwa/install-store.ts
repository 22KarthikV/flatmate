import { getInstallMode, type InstallMode } from "./install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const DISMISS_KEY = "flatmate:install-dismissed";
const listeners = new Set<() => void>();
let deferred: BeforeInstallPromptEvent | null = null;
let dismissed = false;
let started = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function start() {
  if (started) return;
  started = true;
  dismissed = readDismissed();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function subscribeInstall(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallSnapshot(): InstallMode {
  start();
  if (dismissed) return "none";

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return getInstallMode({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
    canPrompt: deferred !== null,
  });
}

export function getServerInstallSnapshot(): InstallMode {
  return "none";
}

export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  deferred = null;
  emit();
}

export function dismissInstall() {
  dismissed = true;
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage can be blocked (private mode). The prompt just reappears next visit.
  }
  emit();
}
