import { describe, expect, it } from "vitest";

import { DELETE_PHRASE, isDeleteConfirmed } from "./delete-account";

describe("isDeleteConfirmed", () => {
  it("accepts the phrase, ignoring surrounding spaces", () => {
    expect(DELETE_PHRASE).toBe("DELETE");
    expect(isDeleteConfirmed("DELETE")).toBe(true);
    expect(isDeleteConfirmed("  DELETE ")).toBe(true);
  });

  it.each(["", "delete", "Delete", "DELET", "DELETE ME", "DELETE\u0000", null, undefined])(
    "rejects %s",
    (value) => {
      expect(isDeleteConfirmed(value as string | null | undefined)).toBe(false);
    },
  );

  it("rejects a non-text form value", () => {
    expect(isDeleteConfirmed(new File([], "x.txt"))).toBe(false);
  });
});
