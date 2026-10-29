import { describe, expect, it } from "vitest";

import { memberActions } from "./permissions";

const none = { canMakeAdmin: false, canMakeMember: false, canRemove: false };

describe("memberActions", () => {
  it("offers nothing on yourself, on the owner, or to a plain member", () => {
    expect(memberActions("owner", "owner", true)).toEqual(none);
    expect(memberActions("admin", "admin", true)).toEqual(none);
    expect(memberActions("admin", "owner", false)).toEqual(none);
    expect(memberActions("member", "member", false)).toEqual(none);
    expect(memberActions("member", "admin", false)).toEqual(none);
  });

  it("lets an admin promote and remove members, and demote admins but not remove them", () => {
    expect(memberActions("admin", "member", false)).toEqual({
      canMakeAdmin: true,
      canMakeMember: false,
      canRemove: true,
    });
    expect(memberActions("admin", "admin", false)).toEqual({
      canMakeAdmin: false,
      canMakeMember: true,
      canRemove: false,
    });
  });

  it("lets the owner do all of it", () => {
    expect(memberActions("owner", "member", false)).toEqual({
      canMakeAdmin: true,
      canMakeMember: false,
      canRemove: true,
    });
    expect(memberActions("owner", "admin", false)).toEqual({
      canMakeAdmin: false,
      canMakeMember: true,
      canRemove: true,
    });
  });
});
