import { describe, expect, it } from "vitest";

import { EnvError, parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts a public VAPID key, treats empty as unset, and refuses junk", () => {
    const key =
      "BJs0g8LtHW4iA3cxm-4DQRIIXkdcbBZ7uVo5T828zfxaZupX_zYVTBG4oDFjeRFvt844biMwFcEEoFv2DD30wts";
    expect(parseEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: key }).NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe(key);
    expect(
      parseEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "" }).NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ).toBeUndefined();
    expect(() => parseEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "short" })).toThrow(EnvError);
  });

  it("applies defaults when nothing is set", () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
  });

  it("accepts valid values", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.LOG_LEVEL).toBe("warn");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abc.supabase.co");
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "", LOG_LEVEL: "" });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("throws a clear error naming every invalid variable", () => {
    expect.assertions(4);
    try {
      parseEnv({ LOG_LEVEL: "loud", NEXT_PUBLIC_SUPABASE_URL: "not a url" });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as Error).message;
      expect(message).toContain("LOG_LEVEL");
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(message).toContain(".env.example");
    }
  });

  it("never puts the offending value in the error message", () => {
    expect.assertions(1);
    try {
      parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "super-secret-value" });
    } catch (error) {
      expect((error as Error).message).not.toContain("super-secret-value");
    }
  });
});
