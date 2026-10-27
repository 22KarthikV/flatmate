import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Reveal } from "./reveal";

afterEach(() => vi.unstubAllGlobals());

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("Reveal", () => {
  it("renders children immediately, before any animation code loads", () => {
    stubMotion(false);
    render(<Reveal>Hello flat</Reveal>);
    expect(screen.getByText("Hello flat")).toBeVisible();
  });

  it("never loads animation code under reduced motion", () => {
    stubMotion(true);
    render(<Reveal className="x">Still here</Reveal>);
    expect(screen.getByText("Still here")).toBeVisible();
  });
});
