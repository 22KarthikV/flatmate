import { describe, expect, it } from "vitest";

import { decideAccess } from "./route-guard";

const signedOut = (pathname: string, search = "") =>
  decideAccess({ pathname, search, signedIn: false });
const signedIn = (pathname: string, search = "") =>
  decideAccess({ pathname, search, signedIn: true });

describe("decideAccess, signed out", () => {
  it.each([
    "/",
    "/sign-in",
    "/privacy",
    "/terms",
    "/offline",
    "/auth/callback",
    "/auth/error",
    "/design",
  ])("lets a visitor see %s", (path) => {
    expect(signedOut(path)).toEqual({ action: "allow" });
  });

  it.each(["/dashboard", "/rota", "/money", "/events", "/more", "/more/account"])(
    "sends a visitor away from %s to sign in, remembering where they were going",
    (path) => {
      expect(signedOut(path)).toEqual({
        action: "redirect",
        to: `/sign-in?next=${encodeURIComponent(path)}`,
      });
    },
  );

  it("keeps the query string in the remembered destination", () => {
    expect(signedOut("/money", "?month=2026-11")).toEqual({
      action: "redirect",
      to: "/sign-in?next=%2Fmoney%3Fmonth%3D2026-11",
    });
  });

  it("denies by default: a route nobody listed needs a session", () => {
    expect(signedOut("/some/new/page").action).toBe("redirect");
    expect(signedOut("/Sign-In").action).toBe("redirect");
    expect(signedOut("/privacy/extra").action).toBe("redirect");
    expect(signedOut("/auth").action).toBe("redirect");
  });
});

describe("decideAccess, signed in", () => {
  it.each(["/", "/dashboard", "/rota", "/more/account", "/privacy", "/auth/callback"])(
    "lets a signed-in person see %s",
    (path) => {
      expect(signedIn(path)).toEqual({ action: "allow" });
    },
  );

  it("moves a signed-in person on from the sign-in page", () => {
    expect(signedIn("/sign-in")).toEqual({ action: "redirect", to: "/dashboard" });
  });

  it("honours a safe next path", () => {
    expect(signedIn("/sign-in", "?next=%2Frota")).toEqual({ action: "redirect", to: "/rota" });
  });

  it("ignores an unsafe next path", () => {
    expect(signedIn("/sign-in", "?next=%2F%2Fevil.com")).toEqual({
      action: "redirect",
      to: "/dashboard",
    });
    expect(signedIn("/sign-in", "?next=https%3A%2F%2Fevil.com")).toEqual({
      action: "redirect",
      to: "/dashboard",
    });
  });
});
