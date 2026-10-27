export type InstallMode = "installed" | "prompt" | "ios" | "none";

export interface InstallEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** Already running as an installed app (standalone display mode). */
  standalone: boolean;
  /** The browser has offered a native install prompt (Chromium on Android and desktop). */
  canPrompt: boolean;
}

export function isIos({
  userAgent,
  platform,
  maxTouchPoints,
}: Pick<InstallEnv, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS reports itself as a Mac, but has touch points.
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** Decides which install help to show. iOS has no install prompt, so it gets instructions. */
export function getInstallMode(env: InstallEnv): InstallMode {
  if (env.standalone) return "installed";
  if (env.canPrompt) return "prompt";
  if (isIos(env)) return "ios";
  return "none";
}
