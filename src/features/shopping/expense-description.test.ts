import { describe, expect, it } from "vitest";

import { shoppingDescription } from "./expense-description";

describe("shoppingDescription", () => {
  it("lists the names", () => {
    expect(shoppingDescription(["milk", "toilet roll", "bin bags"])).toBe(
      "Shopping: milk, toilet roll, bin bags",
    );
  });
  it("copes with one item and none", () => {
    expect(shoppingDescription(["milk"])).toBe("Shopping: milk");
    expect(shoppingDescription([])).toBe("Shopping");
  });
  it("cuts to 80 characters with a +N more suffix", () => {
    const names = Array.from({ length: 12 }, (_, i) => `item number ${i + 1}`);
    const text = shoppingDescription(names);
    expect(text.length).toBeLessThanOrEqual(80);
    expect(text).toMatch(/^Shopping: item number 1, .* \+\d+ more$/);
    const shown = text
      .replace(/ \+\d+ more$/, "")
      .replace("Shopping: ", "")
      .split(", ").length;
    expect(text).toContain(`+${names.length - shown} more`);
  });
  it("shortens a single very long name", () => {
    const text = shoppingDescription(["x".repeat(100)]);
    expect(text.length).toBeLessThanOrEqual(80);
  });
});
