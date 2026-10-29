import { describe, expect, it } from "vitest";

import { buildInviteLink, extractInviteToken, isInviteToken } from "./invite-link";

const TOKEN = "Fk193IB2W6Z9kgq5_aJ-D94u3MxFQwtotcdhx2jj5FY";

describe("isInviteToken", () => {
  it("accepts a 43 character URL-safe token", () => expect(isInviteToken(TOKEN)).toBe(true));

  it.each([
    "",
    "short",
    `${TOKEN}x`,
    TOKEN.slice(1),
    `${TOKEN.slice(1)}!`,
    "../etc/passwd",
    null,
    7,
  ])("rejects %s", (value) => expect(isInviteToken(value)).toBe(false));
});

describe("buildInviteLink", () => {
  it("puts the token in the path", () => {
    expect(buildInviteLink("https://flatmate-ten.vercel.app", TOKEN)).toBe(
      `https://flatmate-ten.vercel.app/join/${TOKEN}`,
    );
  });
});

describe("extractInviteToken", () => {
  it.each([
    TOKEN,
    `  ${TOKEN}\n`,
    `/join/${TOKEN}`,
    `https://flatmate-ten.vercel.app/join/${TOKEN}`,
    `https://flatmate-ten.vercel.app/join/${TOKEN}/`,
    `http://localhost:3000/join/${TOKEN}?utm=chat`,
  ])("finds the token in %s", (input) => expect(extractInviteToken(input)).toBe(TOKEN));

  it.each([
    null,
    "",
    "hello",
    "https://example.com/join/short",
    `https://example.com/other/${TOKEN}`,
    `/join/${TOKEN}/extra`,
    `javascript:alert('${TOKEN}')`,
  ])("finds nothing in %s", (input) => expect(extractInviteToken(input)).toBeNull());
});
