// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), "src/features/home");
const sources = readdirSync(dir)
  .filter(
    (file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
  )
  .map((file) => ({ file, text: readFileSync(path.join(dir, file), "utf8") }));

describe("the home page keeps rent and titles private", () => {
  it("never reads anyone else's rent", () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/getRentDashboard|rent_dashboard|getRecentConfirmedPayments/);
    }
  });

  it("never uses the service key", () => {
    for (const { file, text } of sources)
      expect(text, file).not.toMatch(/service_role|SERVICE_ROLE/);
  });

  it("keeps the page title free of amounts and names", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/(app)/dashboard/page.tsx"), "utf8");
    const title = /title:\s*"([^"]*)"/.exec(page)?.[1] ?? "";
    expect(title).toBe("Home | FlatMate");
    expect(title).not.toMatch(/[£\d]/);
  });
});
