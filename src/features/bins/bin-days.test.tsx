import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ saveBin: vi.fn(), saveException: vi.fn() }));

import { BinDays } from "./bin-days";
import { previewDates } from "./bin-form";
import type { Collection } from "./collections";

const c = (date: string, name: string, over: Partial<Collection> = {}): Collection => ({
  date,
  streamId: name,
  name,
  colour: "grey",
  moved: false,
  originalOn: date,
  note: null,
  ...over,
});

describe("BinDays", () => {
  it("tells a member to ask an admin when there are no bins", () => {
    render(<BinDays collections={[]} today="2026-11-03" isAdmin={false} hasBins={false} />);
    expect(screen.getByText(/Ask an admin to add them/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Set up bins" })).toBeNull();
  });

  it("offers an admin the set-up link", () => {
    render(<BinDays collections={[]} today="2026-11-03" isAdmin hasBins={false} />);
    expect(screen.getByRole("link", { name: "Set up bins" })).toHaveAttribute(
      "href",
      "/more/bins/manage",
    );
  });

  it("says today and tomorrow in words, names every bin, and marks a moved one", () => {
    render(
      <BinDays
        collections={[
          c("2026-11-03", "Grey bin"),
          c("2026-11-04", "Blue box", { moved: true, originalOn: "2026-11-03" }),
          c("2026-11-10", "Grey bin"),
        ]}
        today="2026-11-03"
        isAdmin={false}
        hasBins
      />,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Tuesday 10 Nov")).toBeInTheDocument();
    expect(screen.getAllByText("Grey bin")).toHaveLength(2);
    expect(screen.getByText("(moved)")).toBeInTheDocument();
  });

  it("says so when nothing is due in six weeks", () => {
    render(<BinDays collections={[]} today="2026-11-03" isAdmin={false} hasBins />);
    expect(screen.getByText(/No collections in the next six weeks/)).toBeInTheDocument();
  });
});

describe("previewDates", () => {
  it("gives the next five collections", () => {
    expect(previewDates("2026-11-03", 2, "2026-11-03")).toEqual([
      "2026-11-03",
      "2026-11-17",
      "2026-12-01",
      "2026-12-15",
      "2026-12-29",
    ]);
  });
  it("gives none for an unfinished date", () => {
    expect(previewDates("", 1, "2026-11-03")).toEqual([]);
    expect(previewDates("2026-1", 1, "2026-11-03")).toEqual([]);
  });
});
