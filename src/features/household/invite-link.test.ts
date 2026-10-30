import { describe, expect, it } from "vitest";

import {
  buildInviteLink,
  buildInviteMessage,
  extractInviteToken,
  isInviteToken,
} from "./invite-link";

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

describe("buildInviteMessage", () => {
  it("names the flat in the title and the text, and leaves the link to the url field", () => {
    const message = buildInviteMessage("Flat 3B");
    expect(message.title).toBe("Join Flat 3B on FlatMate");
    expect(message.text).toContain("Flat 3B");
    expect(message.text).not.toContain("http");
    expect(message.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("uses whatever name the owner saved for the flat", () => {
    expect(buildInviteMessage("The Old Bakery").title).toBe("Join The Old Bakery on FlatMate");
    expect(buildInviteMessage("The Old Bakery").text).toContain("chosen for The Old Bakery");
  });

  it("still reads well without a flat name", () => {
    const message = buildInviteMessage("  ");
    expect(message.title).toBe("Join our flat on FlatMate");
    expect(message.text).toContain("our flat");
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
    `Join our flat on FlatMate https://flatmate-ten.vercel.app/join/${TOKEN}`,
    `Join our flat on FlatMate\nhttps://flatmate-ten.vercel.app/join/${TOKEN}\n`,
    `<https://flatmate-ten.vercel.app/join/${TOKEN}>`,
    `https://flatmate-ten.vercel.app/join/${TOKEN}.`,
    `flatmate-ten.vercel.app/join/${TOKEN}`,
    `Join us: https://flatmate-ten.vercel.app/join/${TOKEN}/ see you there`,
  ])("finds the token in %s", (input) => expect(extractInviteToken(input)).toBe(TOKEN));

  it.each([
    null,
    "",
    "hello",
    "https://example.com/join/short",
    `https://example.com/other/${TOKEN}`,
    `/join/${TOKEN}/extra`,
    `https://example.com/join/${TOKEN}/extra`,
    `https://example.com/join/${TOKEN}x`,
    `javascript:alert('${TOKEN}')`,
  ])("finds nothing in %s", (input) => expect(extractInviteToken(input)).toBeNull());
});
