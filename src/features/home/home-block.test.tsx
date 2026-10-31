// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error, info: vi.fn(), warn: vi.fn() } }));

import { BlockBody } from "./home-block";

beforeEach(() => mocks.error.mockReset());

describe("HomeBlock", () => {
  it("renders the block from what it loaded", async () => {
    const element = await BlockBody({
      name: "chores",
      load: async () => ({ count: 2 }),
      children: (data) => <p>{data.count} chores</p>,
    });
    expect(renderToStaticMarkup(element)).toContain("2 chores");
  });

  it("shows one calm line with a way to retry when the read throws, and logs it", async () => {
    const element = await BlockBody({
      name: "money",
      load: async (): Promise<number> => {
        throw new Error("secret database detail");
      },
      children: () => <p>never</p>,
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("load this.");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("secret");
    expect(html).not.toContain("never");
    expect(mocks.error).toHaveBeenCalledWith("home.money_failed", expect.anything());
  });

  it("treats null as a failure, never as an empty answer", async () => {
    const element = await BlockBody({
      name: "money",
      load: async (): Promise<number | null> => null,
      children: () => <p>All square</p>,
    });
    const html = renderToStaticMarkup(element);
    expect(html).not.toContain("All square");
    expect(html).toContain("Try again");
  });

  it("shows the error line when rendering throws too", async () => {
    const element = await BlockBody({
      name: "recent",
      load: async () => 1,
      children: () => {
        throw new Error("bad data");
      },
    });
    expect(renderToStaticMarkup(element)).toContain("Try again");
  });

  it("one failing block leaves another showing", async () => {
    const bad = await BlockBody({
      name: "a",
      load: async (): Promise<number> => {
        throw new Error("x");
      },
      children: () => null,
    });
    const good = await BlockBody({ name: "b", load: async () => 1, children: () => <p>fine</p> });
    expect(renderToStaticMarkup(bad)).toContain("Try again");
    expect(renderToStaticMarkup(good)).toContain("fine");
  });
});
