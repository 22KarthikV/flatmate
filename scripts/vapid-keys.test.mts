import { describe, expect, it } from "vitest";

import { generateVapidKeys } from "./vapid-keys.mts";

describe("generateVapidKeys", () => {
  it("makes a 65-byte uncompressed public key and a 32-byte private key, both base64url", () => {
    const { publicKey, privateKey } = generateVapidKeys();

    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]+$/);
    const point = Buffer.from(publicKey, "base64url");
    expect(point).toHaveLength(65);
    expect(point[0]).toBe(0x04);
    expect(Buffer.from(privateKey, "base64url")).toHaveLength(32);
  });

  it("never repeats", () => {
    expect(generateVapidKeys().privateKey).not.toBe(generateVapidKeys().privateKey);
  });
});
