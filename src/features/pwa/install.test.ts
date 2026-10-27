import { describe, expect, it } from "vitest";

import { getInstallMode, isIos, type InstallEnv } from "./install";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36";

const base: InstallEnv = {
  userAgent: DESKTOP_UA,
  platform: "Win32",
  maxTouchPoints: 0,
  standalone: false,
  canPrompt: false,
};

describe("isIos", () => {
  it("detects iPhone and iPad user agents", () => {
    expect(isIos({ ...base, userAgent: IPHONE_UA })).toBe(true);
    expect(isIos({ ...base, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0)" })).toBe(true);
  });

  it("detects iPadOS posing as a Mac, but not a real Mac", () => {
    expect(isIos({ ...base, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ ...base, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });

  it("does not treat Android or desktop as iOS", () => {
    expect(isIos({ ...base, userAgent: ANDROID_UA })).toBe(false);
    expect(isIos(base)).toBe(false);
  });
});

describe("getInstallMode", () => {
  it("shows nothing once installed, even on iOS", () => {
    expect(getInstallMode({ ...base, userAgent: IPHONE_UA, standalone: true })).toBe("installed");
  });

  it("offers the native prompt when the browser provides one", () => {
    expect(getInstallMode({ ...base, userAgent: ANDROID_UA, canPrompt: true })).toBe("prompt");
  });

  it("gives manual instructions on iOS", () => {
    expect(getInstallMode({ ...base, userAgent: IPHONE_UA })).toBe("ios");
  });

  it("offers nothing where install is not possible", () => {
    expect(getInstallMode(base)).toBe("none");
  });
});
